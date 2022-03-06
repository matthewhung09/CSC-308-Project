const express = require("express");
const res = require("express/lib/response");
const dotenv = require("dotenv");
const axios = require("axios");
const qs = require("qs");
const cors = require("cors");
const { access } = require("fs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const postServices = require("./models/post-services");
const userServices = require("./models/user-services");
const checkUser = require("./middleware/authMiddleware");
const app = express();
const port = 5000;

// import Bottleneck from "bottleneck";
// Note: To support older browsers and Node <6.0, you must import the ES5 bundle instead.
var Bottleneck = require("bottleneck");
const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 333,
});

dotenv.config();

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const auth_token = Buffer.from(`${client_id}:${client_secret}`, "utf-8").toString(
    "base64"
);

app.use(cookieParser());
app.use(cors({ credentials: true, origin: "http://localhost:3000" }));
app.use(express.json());

const handleErrors = (err) => {
    let errors = { username: "", email: "", password: "" };

    if (err.message == "incorrect email") {
        errors.email = "Email is not registered.";
    }
    if (err.message == "incorrect password") {
        errors.password = "Password is incorrect.";
    }

    // validation errors
    if (err.message.includes("User validation failed")) {
        Object.values(err.errors).forEach(({ properties }) => {
            if (properties.message.includes("expected `email` to be unique")) {
                errors[properties.path] = "Email already in use.";
                return;
            }
            errors[properties.path] = properties.message;
        });
    }
    return errors;
};

// Get all posts from the database
// Called on initial load
// checkUser validates the jwt, sets req.user to the user
app.get("/posts", checkUser, async (req, res) => {
    try {
        const posts = await postServices.getPosts();
        res.status(201).json({ posts: posts, user: req.user });
    } catch (error) {
        res.status(500).send(error.message);
        console.log(error);
    }
});

// Creates a new post and adds it to the database
app.post("/create", async (req, res) => {
    // const new_post = await getPostData(
    //     req.body.title,
    //     req.body.artist,
    //     req.body.location
    // );
    const new_post = await limiter.schedule(() =>
        getPostData(req.body.title, req.body.artist, req.body.location)
    );

    let post = await postServices.addPost(new_post);
    if (post) {
        res.status(201).json(post);
    } else {
        res.status(500).end();
    }
});

// Queries Spotify API to get song information
async function getPostData(song, artist, location) {
    const data = {
        type: "track",
        limit: "10",
    };
    // Format querystring
    const first_part =
        "q=track:" +
        song.replaceAll(" ", "%20") +
        "%20artist:" +
        artist.replaceAll(" ", "%20");
    const second_part = new URLSearchParams(data).toString();
    const queryparam = first_part + "&" + second_part;

    // const access_token = await getAccessToken();
    const access_token = await limiter.schedule(() => getAccessToken());

    try {
        const response = await axios.get(
            "https://api.spotify.com/v1/search?" + queryparam,
            {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                },
            }
        );
        const song_url = response.data.tracks.items[0].external_urls.spotify;

        // Get actual song name and artist in case of mispellings/typos
        const song_name = response.data.tracks.items[0].name;
        const song_artist = response.data.tracks.items[0].artists[0].name;

        const new_post = {
            title: song_name,
            artist: song_artist,
            likes: 0,
            url: song_url,
            location: location,
        };
        console.log(new_post);
        return new_post;
    } catch (error) {
        console.log(error);
    }
}

// Get access token in order to use Spotify API
// This is different from /auth/login - here we use our developer credentials
// to get access token to make requests to API
async function getAccessToken() {
    try {
        const data = qs.stringify({
            grant_type: "client_credentials",
        });
        const response = await axios.post(
            "https://accounts.spotify.com/api/token",
            data,
            {
                headers: {
                    Authorization: `Basic ${auth_token}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.log(error);
    }
}

// Update user array and post and then send back new post and user information
app.patch("/user/:id/liked", async (req, res) => {
    const id = req.params["id"];
    const post = req.body.post;
    const liked = req.body.liked;
    let updatedUser;
    let updatedPost = await postServices.updateLikeStatus(post, liked);
    if (liked) updatedUser = await userServices.removeUserLiked(id, post);
    else updatedUser = await userServices.addUserLiked(id, post);

    if (updatedUser && updatedPost) {
        res.status(201).json({
            post: updatedPost,
            user: updatedUser,
        });
    } else {
        res.status(404).send("Resource not found.");
    }
});

function createToken(id) {
    // payload, secret, options
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: 3600, // in SECONDS
    });
}

// Adds user to database upon signup
app.post("/signup", async (req, res) => {
    const new_user = req.body;
    try {
        // log user in instantaneously
        const user = await userServices.addUser(new_user);
        if (user.errors) {
            const errors = handleErrors(user);
            res.status(400).json({ errors });
        } else {
            const token = createToken(user._id);
            res.cookie("jwt", token, { httpOnly: true, maxAge: 3600 * 1000 });
            res.status(201).json({ user: user });
        }
    } catch (err) {
        const errors = handleErrors(err);
        res.status(400).json({ errors });
    }
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await userServices.login(email, password);
        const token = createToken(user._id);
        res.cookie("jwt", token, { httpOnly: true, maxAge: 3600 * 1000 });
        res.status(200).json({ user: user });
    } catch (err) {
        const errors = handleErrors(err);
        res.status(400).json({ errors });
    }
});

// Delete the cookie
app.get("/logout", (req, res) => {
    res.clearCookie("jwt");
    res.redirect("/");
});

app.get("/user/:id", async (req, res) => {
    const id = req.params["id"];
    const result = await userServices.findUserById(id);
    if (result === undefined || result === null)
        res.status(404).send("Resource not found.");
    else {
        res.send({ user: result });
    }
});

app.get("/user/:id/liked", async (req, res) => {
    const id = req.params["id"];
    const result = await userServices.getUserLiked(id);
    if (result === undefined || result === null)
        res.status(404).send("Resource not found.");
    else {
        res.send(result);
    }
});

// Handles user login - gets access token and reroutes them to redirect_uri
app.post("/auth/login", async (req, res) => {
    const code = req.body.code;
    let response;

    try {
        const data = qs.stringify({
            grant_type: "authorization_code",
            code: code,
            redirect_uri: "http://localhost:3000/home",
        });
        response = await axios.post("https://accounts.spotify.com/api/token", data, {
            headers: {
                Authorization: `Basic ${auth_token}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });
    } catch (error) {
        console.log(error);
    }
    console.log("logged in");
    res.json({
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
    });
});

// Refreshes token
app.post("/auth/refresh", async (req, res) => {
    const refreshToken = req.body.refreshToken;
    let response;
    console.log("here");
    try {
        const data = qs.stringify({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        });
        response = await axios.post("https://accounts.spotify.com/api/token", data, {
            headers: {
                Authorization: `Basic ${auth_token}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });
    } catch (error) {
        console.log(error);
    }

    res.json({
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
    });
});

// Gets current playing song
app.post("/current", async (req, res) => {
    const accessToken = req.body.accessToken;
    let response;
    try {
        response = await axios.get(
            "https://api.spotify.com/v1/me/player/currently-playing",
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (error) {
        console.log(error);
    }
    return res.json({
        song: response.data.item.name,
    });
});

app.listen(port, () => {
    console.log(`listening at http://localhost:${port}`);
});

app.get("/", (req, res) => {
    res.send("Hello, World");
});
