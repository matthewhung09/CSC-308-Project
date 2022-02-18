const express = require('express');
const res = require('express/lib/response');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');
const qs = require('qs');
const cors = require('cors');
const postServices = require('./models/post-services');
const app = express();
const port = 5000;
const Post = require('./models/post');
const mongoose = require('mongoose');
const { access } = require('fs');

dotenv.config({path: path.resolve(__dirname, '.env')})

const client_id = process.env.CLIENT_ID; 
const client_secret = process.env.CLIENT_SECRET; 
const auth_token = Buffer.from(`${client_id}:${client_secret}`, 'utf-8').toString('base64');

app.use(cors());
app.use(express.json());

if (!process.env.CONNECTION_URL) {
    console.warn('missing connection url')
}
mongoose
    .connect(process.env.CONNECTION_URL)
    .then(() => console.log('Connected to database'))
    .catch((error) => console.log(error));

app.listen(port, () => {
    console.log(`listening at http://localhost:${port}`);
  });

app.get('/', (req, res) => {
    res.send('Hello, World');
});

// Get all posts from the database
// Called on initial load
app.get('/posts', async (req, res) => {
    try {
        const posts = await Post.find({});
        res.send(posts);         
    } catch (error) {
        res.status(500).send(error.message);
        console.log('error');
    }
});

// Handles user login - gets access token and reroutes them to redirect_uri
app.post('/auth/login', async (req, res) => {
    const code = req.body.code;
    let response;

    try {
        const data = qs.stringify({
            'grant_type':'authorization_code', 
            'code': code, 
            'redirect_uri': 'http://localhost:3000'
        });
        response = await axios.post('https://accounts.spotify.com/api/token', data, {
            headers: {
                'Authorization': `Basic ${auth_token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
    }
    catch(error) {
        console.log(error);
    }
    console.log('logged in');
    res.json({
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
    });
});

// Refreshes token 
app.post('/auth/refresh', async (req, res) => {
    const refreshToken = req.body.refreshToken;
    let response;
    console.log('here');
    try {
        const data = qs.stringify({
            'grant_type':'refresh_token', 
            'refresh_token': refreshToken
        });
        response = await axios.post('https://accounts.spotify.com/api/token', data, {
            headers: {
                'Authorization': `Basic ${auth_token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
    }
    catch(error) {
        console.log(error);
    }

    res.json({
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
    });    
});

// Gets current playing song
app.post('/current', async (req, res) => {
    const accessToken = req.body.accessToken;
    let response;
    try {
        response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        })
    }
    catch(error) {
        console.log(error);
    }
    console.log(response.data.item.name);
    return res.json({
        song: response.data.item.name,
    });
});

// Creates a new post and adds it to the database
app.post('/create', async (req, res) => {
    const new_post = await getPostData(req.body.title, req.body.artist)
    let post = new Post(new_post);
    post = await post.save();
    res.status(201).json(post); // same as res.send except sends in json format
});

// Queries Spotify API to get song information
async function getPostData(song, artist) {
    const data = {
        'type': 'track',
        'limit': '10'
    }
    // Format querystring - should probably find a better way to do this
    const first_part = 'q=track:' + song.replaceAll(' ', '%20') + '%20artist:' + artist.replaceAll(' ', '%20');
    const second_part = new URLSearchParams(data).toString();
    const queryparam = first_part + '&' + second_part;

    const access_token = await(getAccessToken());

    try {
        const response = await axios.get('https://api.spotify.com/v1/search?' + queryparam, {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });
        const song_url = response.data.tracks.items[0].external_urls.spotify;
        
        // Get actual song name and artist in case of mispellings/typos
        const song_name = response.data.tracks.items[0].name; 
        const song_artist = response.data.tracks.items[0].artists[0].name;
        const album_cover = response.data.tracks.items[0].album.images[2].url;
        const song_uri = response.data.tracks.items[0].uri;

        const new_post = {
            'title': song_name,
            'artist': song_artist,
            'likes': 0,
            'liked': false,
            'url': song_url,
            'album': album_cover,
            'uri': song_uri
        };
        // console.log(new_post);
        return new_post;
    }
    catch(error) {
        console.log(error);
    }
}

// Get access token in order to use Spotify API
// This is different from /auth/login - here we use our developer credentials 
// to get access token to make requests to API
async function getAccessToken() {
    try {
        const data = qs.stringify({
            'grant_type':'client_credentials'
        });
        const response = await axios.post('https://accounts.spotify.com/api/token', data, {
            headers: {
                'Authorization': `Basic ${auth_token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
        return response.data.access_token;
    }
    catch(error) {
        console.log(error);
    }
}

app.patch('/like/:id', async (req, res) => {
    const id = req.params['id'];
    const liked_status = req.body.liked;
    let updatedPost;

    if (!liked_status) {
        updatedPost = await Post.findByIdAndUpdate(id, 
            {$inc: {likes: 1}, $set: {liked: true}},
            {new: true}
        );
    }
    else {
        updatedPost = await Post.findByIdAndUpdate(id, 
            {$inc: {likes: -1}, $set: {liked: false}},
            {new: true}
        ); 
    }

    if (updatedPost)
        res.status(201).send(updatedPost);
    else {
        res.status(404).send('Resource not found.');
    }
});

