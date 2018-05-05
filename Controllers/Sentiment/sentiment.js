var fs = require('fs');
var utils = require('util');
var fetch = require('node-fetch');
var EventEmitter = require('events').EventEmitter;

function Sentiment(){
	EventEmitter.call(this);
}
utils.inherits(Sentiment, EventEmitter);

var azureKey = fs.readFileSync(__dirname + "/azureKey.txt","utf8").toString().trim();

// Correlates tweet locations and tweet sentiments into on array
Sentiment.prototype.joinSentimentLocation = function(self, tweets, sentiment){
  map = []
  for(i = 0; i < tweets.length; i++){
    loc = tweets[i].location
    if(loc in map){
      map[loc].sentimentSum += sentiment[i].score
      map[loc].count++
    }else{
      map[loc] = {
        sentimentSum : sentiment[i].score,
        count : 1
      }
    }
  }

  res = []
  for (var key in map) {
    if (map.hasOwnProperty(key)) {
      res.push({
        location: key,
        sentiment: map[key].sentimentSum / map[key].count
      })
    }
  }

  self.emit("sentimentResponse", res);
}

// Queries Azure for tweet sentiments
Sentiment.prototype.getTweetSentiments = function(tweets){
  data = []
  self = this
  for(i = 0; i<tweets.length; i++){
    data.push({
      id: i.toString(),
      language: "en",
      text: tweets[i].tweet
    });
  }
  data = {documents: data}

  jsonData = JSON.stringify(data);

  fetch('https://westus.api.cognitive.microsoft.com/text/analytics/v2.0/sentiment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': azureKey,
      'Content-Length': Buffer.byteLength(jsonData)
    },
    body: jsonData
  }).then(function(res){
    return res.json();
  }).then(function(json){
    self.joinSentimentLocation(self, tweets, json.documents);
  });
}

module.exports = Sentiment;
