/**
 * This object represents a Twitter searcher. It gets the tweet timeline for a particular user and searches for content I'm interested in.
 */


var cfg         = require('config');
var fs          = require('fs');
var request     = require('request');
var SiteTrawler = require('./SiteTrawler.js');
var jsonFile    = require('jsonfile');
var Q           = require('q');



/**
 * Basic request params for all calls to Twitter
 */
var twitterRequestDefaults = {
  baseUrl : 'https://api.twitter.com/1.1',
  json : true,
  oauth: {
    consumer_key: cfg.twitter.consumerKey,
    consumer_secret: cfg.twitter.consumerSecret,
    token: cfg.twitter.accessToken,
    token_secret: cfg.twitter.accessTokenSecret
  }
}

if (cfg.has('connectionTimeout')) { twitterRequestDefaults.timeout = cfg.connectionTimeout }


var twitterRequest = request.defaults(twitterRequestDefaults)



class TwitterTrawler extends SiteTrawler {

  /**
   * TwitterTrawler model constructor.
   * @param {object}   params               - Params to be passed in
   * @param {string}   params.id            - English name for the trawler instance. Will be used as a unique identifier.
   * @param {number=}  params.maxResults    - Max number of results to be returned from the site being trawled. (optional)
   * @param {string}   params.twitterId     - Twitter handle of the twitter account whose stream you want to read.
   * @param {regex[]}  params.tweetMatches  - A regular expression to run against the tweet. If provided, only tweets matching this regex will be returned. Optional arg
   * @constructor
   */
  constructor(params) {
  
    var superArgs = {}
    superArgs.id = params.id

    if (params.maxResults) { superArgs.maxResults = params.maxResults }
    super(superArgs)

    this.twitterId    = params.twitterId

    if (params.tweetMatches) {
      this.tweetMatches = []

      for (var i = 0; i < params.tweetMatches.length; i++) {
        var tm = params.tweetMatches[i]
        this.tweetMatches.push( new RegExp(tm.pattern, tm.flags) )
      }
    }
  }

}
  
var method = TwitterTrawler.prototype


/**
 * TwitterTrawler.getResultsString
 *
 * @desc Get an English string describing the contents of the results. This function needs to be overridden by each trawler subclass.
 *
 * @alias TwitterTrawler.getResultString
 *
 */
method.getResultsString = function () {

  var ret = "" 

  for (var i = 0; i < this.results.length; i++) {
    ret += "<br>" + this.results[i].contents.text.replace(/\n|\r/g)
  }

  this.log('info', ret)

  return ret
}


/**
 * TwitterTrawler.loadResults
 *
 * @desc Get the next x arrivals at this stop and their times
 *
 * @alias TwitterTrawler.loadResults
 *
 * @param  {object} params     - Parameters for request (currently unused)
 * @param  {callback} callback - The callback that handles the response. Returns callback(err, tweets[])
 *                               where tweets are objects of the form {
 *                                 id: twitter Id
 *                                 content: the text of the tweet
 *                               }
 */
method.loadResults = function (params,cb) {

  var self = this

  self.log('info', 'Getting tweets from @' + self.twitterId + '...')

  var qs = {
    screen_name: self.twitterId, 
    trim_user: true,
    exclude_replies: true
  }

  if (self.maxResults)              { qs.count    = self.maxResults }
  if (self.savedData.highestSeenId) { qs.since_id = self.savedData.highestSeenId }

  twitterRequest.get({
    uri: 'statuses/user_timeline.json',
    qs: qs
  }, function (err, resp, tweets) {

    if (err) {
      var errMsg = 'Bad response from Twitter: ' + err
      self.log('error', errMsg)
      cb(errMsg)
      return null
    }

    if (resp.statusCode > 200) {
      var errMsg = 'Unexpected response from Twitter: (' + resp.statusCode + ') ' + JSON.stringify(resp.body)
      self.log('error', errMsg)
      cb(errMsg)
      return null
    }

    self.log('debug', 'Twitter response - {' + resp.body + '}')
    self.log('debug', 'Twitter response headers - {' + JSON.stringify(resp.headers,null,"\t") + '}')

    // Twitter has an odd behaviour when you specify a since_id. It might still return the result with that since_id, so ignore it if it does.
    if (self.savedData.highestSeenId) {
      tweets = tweets.filter(function (tweet) {
        if (tweet.id <= self.savedData.highestSeenId) {
          self.log('info', 'Skipping seen tweet: ' + tweet.id)
          return false
        } else {
          return true
        }
      })

    }


    if (tweets.length == 0) {
      self.log('info', 'No tweets.')
      cb(null,[])
      return null
    }

    self.log('info', 'Got ' + tweets.length + ' tweets.')
    self.log('debug', 'Tweets -  {' + JSON.stringify(tweets) + '}')

    // Extract the relevant information and send back in the format prescribed by the superclass
    // The tweets come in in descending chronological order so start at the end and come back down to find the latest
    for (var i = (tweets.length - 1); i >= 0; i--) {

      var tweet = tweets[i]

      var id   = tweet.id
      var text = tweet.text
      var date = tweet.created_at

      self.log('info', 'Reading tweet (' + id + ' - ' + date + ') ' + text)

      var add = false


      if (self.tweetMatches) {

        for (var j = 0; j < self.tweetMatches.length; j++) {

          var re = self.tweetMatches[j]
          self.log('debug', '---> Testing against ' + re.toString())

          if (text.match(re)) {
            add = true;
            self.log('info','Matched')
            break;
          }
        }

      } else {
        add = true
      }

      if (add) {
        self.results.push({
          id: id,
          contents: tweet
        })
      } else {
        self.log('info','Not matched')
      }
    }

    // Save the higest seen id so we're able to filter on the next run
    self.dataToSave.highestSeenId = tweets[0].id

    cb(null,self.results)

  })
}



module.exports = TwitterTrawler