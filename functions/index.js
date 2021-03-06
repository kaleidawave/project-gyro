require('svelte/register');

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// I probably should have made the firebase config environment variables but they are public anyway
function buildHtml(html, head) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="ie=edge">
        <link href="https://fonts.googleapis.com/css?family=Nunito+Sans:200,400&display=swap" rel="stylesheet">
        <link rel="stylesheet" type="text/css" href="/styles.css">
        <link rel="shortcut icon" href="favicon.ico" type="image/x-icon">
        <meta name="google-site-verification" content="fCLLPyTv6aBhQ8qoxgh8rUxeBcejIkJIfF_MOGGJKis" />
        <script src="https://cdn.jsdelivr.net/npm/js-cookie@2/src/js.cookie.min.js"></script>
        <script src="/__/firebase/6.1.1/firebase-app.js"></script>
        <script src="/__/firebase/6.1.1/firebase-auth.js"></script>
        <!-- Global site tag (gtag.js) - Google Analytics -->
        <script async src="https://www.googletagmanager.com/gtag/js?id=UA-141711670-1"></script>
        <script>
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            
            gtag('config', 'UA-141711670-1');
        </script>

        <script defer src="/auth.js"></script>
        <script>
            const firebaseConfig = { apiKey: "AIzaSyBmJIhDo8W76jzF6GgvwqQ0HAycRuGVF9A", authDomain: "project-gyro.firebaseapp.com", databaseURL: "https://project-gyro.firebaseio.com", projectId: "project-gyro", storageBucket: "project-gyro.appspot.com", messagingSenderId: "99361186654", appId: "1:99361186654:web:534ea35f0038d280" };
            firebase.initializeApp(firebaseConfig);
        </script>
        <title>Project Gyro</title>
        ${head}
    </head>
    <body>
        ${html}
    </body>
    </html>`;
}

const server = express();
const serviceAccount = require("./project-gyro-admin-key.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://project-gyro.firebaseio.com",
    storageBucket: "gs://project-gyro.appspot.com"
});

const firestore = admin.firestore();

const Home = require('./src/pages/Home.svelte').default;
const User = require('./src/pages/User.svelte').default;
const Users = require('./src/pages/Users.svelte').default;
const Submit = require('./src/pages/Submit.svelte').default;
const Post = require('./src/pages/Post.svelte').default;
const Posts = require('./src/pages/Posts.svelte').default;
const _404 = require('./src/pages/404.svelte').default;

// Automatically allow cross-origin requests
server.use(cors({ origin: true }));

server.get('/', function (req, res) {
    const { html, head } = Home.render();
    res.send(buildHtml(html, head));
});

server.get('/submit', function (req, res) {
    const { html, head } = Submit.render();
    res.send(buildHtml(html, head));
});

server.get('/users', async function (req, res) {
    try {
        const page = req.query.page || 1;
        const users = await firestore.collection('users').limit(10).offset((page - 1) * 10).get().then(r => r.docs.map(doc => doc.data()));
        const { html, head } = Users.render({ users, page });
        res.send(buildHtml(html, head));
    } catch (error) {
        res.status(404).send(buildHtml(_404.render().html, ''));
    }
});

server.get('/posts', async function (req, res) {
    try {
        const page = req.query.page || 1;
        const posts = await firestore.collection('posts').limit(12).offset((page - 1) * 10).get().then(r => r.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        const { html, head } = Posts.render({ posts, page });
        res.send(buildHtml(html, head));
    } catch (error) {
        res.status(404).send(buildHtml(_404.render().html, ''));
    }
});

server.get('/user/:username', async function (req, res) {
    let profile = null;
    let posts = [];
    try {
        const queries = await firestore.collection('users').where('username', '==', req.params.username).get();
        posts = await firestore.collection('posts').where('author', '==', req.params.username)
            .limit(9).get().
            then(col => col.docs.map(doc => ({ ...doc.data(), id: doc.id })));

        profile = queries.docs[0].data();
        const { html, head } = User.render({ ...profile, posts, url: `${req.protocol}://${req.get('host')}${req.originalUrl}` });
        res.send(buildHtml(html, head));
    }
    catch (error) {
        res.status(404).send(buildHtml(_404.render().html, ''));
    }
});

server.get('/post/:id', async function (req, res) {
    let post = null;
    try {
        post = await firestore.collection('posts').doc(req.params.id).get().then(doc => ({...doc.data(), id: doc.id}));
        const { html, head } = Post.render({ ...post, url: `${req.protocol}://${req.get('host')}${req.originalUrl}` });
        res.send(buildHtml(html, head));
    }
    catch (error) {
        res.status(404).send(buildHtml(_404.render().html, ''));
    }
});

server.get('*', function (req, res) {
    res.status(404).send(buildHtml(_404.render().html, ''));
});

exports.app = functions.https.onRequest(server);

exports.userCreate = functions.auth.user().onCreate(async (user) => {

    // we will first test if the username already exist
    // this is extremely unlikely but in the case someone changes there username on twitter the firebase value
    // will not be updated and thus somebody could slip in with the same in and break our system
    const usernameTaken = await firestore.collection('users').where('username', '==', user.displayName).get().then(doc => !doc.empty);

    // If username is take append a random number (between 0 and 1000) to the username
    // Of course we should do another check to see whether the new username is taken but the chances are so low now
    // that its not worth implementing and we could make between 0 and 1 million to make it even rarer.
    const username = usernameTaken ? `${user.displayName}${Math.floor(Math.random() * 1000)}` : user.displayName;

    // publicizing user.uid seems dangerous but we have been affirmed by firebasers that its perfectly safe
    // https://stackoverflow.com/questions/42620723/firebase-database-risks-associated-with-exposing-uid-on-the-client-side
    await firestore.collection('users').doc(user.uid).set({
        username,
        photoURL: user.photoURL
    });
    // we could add more data to this document such as bio, followers, ...
});

exports.userDelete = functions.auth.user().onDelete(async (user) => {
    await firestore.collection('users').doc(user.uid).delete();
});

const mimeTypes = require('mimetypes');

exports.submitPost = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        return { error: 'You need to login to post' };
    }
    else {
        const { username } = await firestore.collection('users').doc(context.auth.uid).get().then(doc => doc.data());

        const randomName = Math.random().toString(36).substring(2, 12);

        const mimeType = data.image.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/)[1];
        const base64EncodedImageString = data.image.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = new Buffer(base64EncodedImageString, 'base64');

        const filename = `posts/${randomName}.${mimeTypes.detectExtension(mimeType)}`;
        const file = admin.storage().bucket().file(filename);
        await file.save(imageBuffer, { contentType: 'image/jpeg' });
        const photoURL = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' }).then(urls => urls[0]);

        return await firestore.collection('posts').add({
            author: username,
            photoURL,
            filename,
            title: data.name || 'Post'
        }).then(r => {
            return { success: true, id: r.id };
        }).catch(error => {
            return { success: false };
        });
    }
});

exports.deletePost = functions.https.onCall(async (data, context) => {
    try {
        const { username } = await firestore.collection('users').doc(context.auth.uid).get().then(doc => doc.data());
        const { author, filename } = await firestore.collection('posts').doc(data.postID).get().then(doc => doc.data());
        if (!context.auth || username !== author) {
            return { error: 'You do not have permission to delete this post' };
        }
        else {
            await admin.storage().bucket().file(filename).delete();
            return await firestore.collection('posts').doc(data.postID).delete()
                .then(() => ({error: null}))
                .catch(() => ({ error: 'An error occurred' }));
        }
    } catch (error) {
        return { error: 'An error occurred' };
    }
});