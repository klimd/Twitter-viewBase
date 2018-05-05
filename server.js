var express = require('express');
var app = express();
var port = process.env.port || 8080;

// Lets Node serve files from the Public directory
app.use(express.static(__dirname + '/Public/'));

// Set Node to listen for incoming connections on port 8080
app.listen(port,function(){
	console.log("Server Running");
});

var TweetController = require("./Controllers/Tweets/tweets");
var tc = new TweetController();
var SentimentController = require("./Controllers/Sentiment/sentiment");
var sc = new SentimentController();
var DatabaseController = require("./Controllers/Database/database");
var db = new DatabaseController();

app.get("/getSentimentMap", function(req,res){
	hashtag = req.query.hashtag;

	db.once("cacheResponse", function(response){
		if(response != null){
			db.incrementNumSearches(hashtag);
			res.status(200).send(response);
		}else{
			tc.once("tweetsResponse", function(tweets){
		    sc.getTweetSentiments(tweets);
		  });
		  sc.once("sentimentResponse", function(result){
				db.storeResult(hashtag, JSON.stringify(result));
		    res.status(200).send(result);
		  });
		  tc.getTweets(hashtag);
		}
	});
	db.getCachedResult(hashtag);
});

app.get("/getTopHashtags", function(req,res){
	db.once("topSearchResponse", function(response){
		res.status(200).send(response);
	});
	db.topSearches();
});
