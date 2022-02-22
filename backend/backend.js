const express = require('express');
const res = require('express/lib/response');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');
const qs = require('qs');
const cors = require('cors');
const postServices = require('./models/post-services');
const userServices = require('./models/user-services');
const app = express();
const port = 5000;
const { access } = require('fs');

dotenv.config({path: path.resolve(__dirname, '.env')})

const client_id = process.env.CLIENT_ID; 
const client_secret = process.env.CLIENT_SECRET; 
const auth_token = Buffer.from(`${client_id}:${client_secret}`, 'utf-8').toString('base64');

app.use(cors());
app.use(express.json());

app.listen(port, () => {
    console.log(`listening at http://localhost:${port}`);
  });

app.get('/', (req, res) => {
    res.send('Hello, World');
});

app.get('/posts', async (req, res) => {
    try {
        const posts = await postServices.getPosts();
        res.send(posts);         
    } catch (error) {
        res.status(500).send(error.message);
        console.log('error');
    }
});

app.post('/auth/login', async (req, res) => {
    const code = req.body.code;
    let response;
    const auth = Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`, 'utf-8').toString('base64');

    try {
        const data = qs.stringify({'grant_type':'authorization_code', 'code': code, 'redirect_uri': 'http://localhost:3000'});
        response = await axios.post('https://accounts.spotify.com/api/token', data, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
    }
    catch(error) {
        console.log(error);
    }
    console.log(response.data);
    res.json({
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
    });
});

app.post('/create', async (req, res) => {
    const new_post = await getPostData(req.body.title, req.body.artist)
    let post = await postServices.addPost(new_post);
    if(post){
        res.status(201).json(post); // same as res.send except sends in json format
    }
    else{
        res.status(500).end();
    }
    
});

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

async function getAccessToken() {
    try {
        const data = qs.stringify({'grant_type':'client_credentials'});
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
    let updatedPost = postServices.updateLikeStatus(id, liked_status);
    if (updatedPost)
        res.status(201).send(updatedPost);
    else {
        res.status(404).send('Resource not found.');
    }
});

app.post('/user', async (req, res) => {
    const new_user = req.body;
    let user =  await userServices.addUser(new_user);
    if(post){
        res.status(201).json(user);
    }
    else{
        res.status(500).end();
    }
});

app.get('/user', async (req, res) => {
    try {
        const users = await userServices.getUsers();
        res.send(users);         
    } catch (error) {
        res.status(500).send(error.message);
        console.log('error');
    }
});

app.get('/user/:id', async (req, res) => {
    const id = req.params['id'];
    const result = await userServices.findUserById(id);
    if (result === undefined || result === null)
        res.status(404).send('Resource not found.');
    else {
        res.send({user: result});
    }
});

app.get('/user/:id/liked', async (req, res) => {
    const id = req.params['id'];
    const result = await userServices.getUserLiked(id);
    if (result === undefined || result === null)
        res.status(404).send('Resource not found.');
    else {
        res.send(result);
    }
});

app.patch('/user/:id/liked', async (req, res) => {
    const id = req.params['id'];
    const post = req.body.post;
    const updatedUser = await userServices.addUserLiked(id, post);
    if (updatedUser)
        res.status(201).send(updatedUser);
    else {
        res.status(404).send('Resource not found.');
    }
});
