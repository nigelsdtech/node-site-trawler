var cfg             = require('config');
var chai            = require('chai');
var jsonFile        = require('jsonfile');
var nock            = require('nock');
var TwitterTrawler  = require('../../../../lib/classes/TwitterTrawler.js');

/*
 * Set up chai
 */
chai.should();


// Common testing timeout
var timeout = cfg.timeout || (20*1000);

var twitterHost = "https://api.twitter.com/1.1"

var basicTweetSearch = {
  id           : "@SecretFlying-Twitter",
  maxResults   : 5,
  twitterId    : "SecretFlying",
  regexMatches : [{
    pattern: "roundtrip", flags: "i"}, {
    pattern: "video",     flags: "i"}]
}


/*
 * The actual tests
 */

describe('TwitterTrawler', () => {

  describe('TwitterTrawler.getResults', function () {

    this.timeout(timeout)
  
    var tweetData = jsonFile.readFileSync('./test/data/responseTweetsSecretFlying.json')
    
    var twitterTrawler, b, nockRet, td
    
    beforeEach (function () {
  
      nockRet = nock(twitterHost)
      .persist()
      .log(console.log)
      .get("/statuses/user_timeline.json")
      .query({
        screen_name: "SecretFlying",
        count: 5,
        trim_user: "true",
        exclude_replies: "true"
      })
  
      b = Object.assign({},basicTweetSearch)
      td = tweetData.slice()
    })
  
  
    it('returns tweets matching the regex criteria', async function () {
  
      nockRet.reply(200,td)
      twitterTrawler = new TwitterTrawler(b)
  
      const tweets = await twitterTrawler.getResults(null)

      const ret = tweets.map((t) => {return t.id})

      ret.should.have.members([
        1001099733413318656,
        1001090388910886917,
        1001084599290642432,
        1001102141761650700
      ])
    });
  
    it('filters out incoming tweets that are lower id\'s than ones we\'ve seen on previous runs', async function () {
  
      var highestSeenId = 1001094077708947456
  
      nockRet = nock(twitterHost)
      .persist()
      .log(console.log)
      .get("/statuses/user_timeline.json")
      .query({
        screen_name: "SecretFlying",
        trim_user: "true",
        exclude_replies: "true",
        count: 5,
        since_id: highestSeenId
      })
      .reply(200,td)
  
      twitterTrawler = new TwitterTrawler(b)
      twitterTrawler.setSavedData({savedData: {highestSeenId: highestSeenId} })
  
  
      const tweets = await twitterTrawler.getResults(null)
  
      const ret = tweets.map((t) => {return t.id})

      ret.should.have.members([
        1001102141761650700,
        1001099733413318656
      ])

    });
  
    it('still makes requests correctly when optional arguments aren\'t passed in', async function () {
  
      nockRet = nock(twitterHost)
      .persist()
      .log(console.log)
      .get("/statuses/user_timeline.json")
      .query({
        screen_name: "SecretFlying",
        trim_user: "true",
        exclude_replies: "true"
      })
      .reply(200,td)
  
      delete b['maxResults']
      twitterTrawler = new TwitterTrawler(b)
  
      await twitterTrawler.getResults(null)
      nockRet.isDone().should.be.true

    });
  
    it('returns no tweets', async function () {
  
      nockRet.reply(200,[])
      twitterTrawler = new TwitterTrawler(b)
  
      const tweets = await twitterTrawler.getResults(null)
      tweets.should.deep.equal([])

    });
  
    it('reports if Twitter returned a bad response due to internal error', async function () {
  
      nockRet.reply(503,'Simulated 503 error')
      twitterTrawler = new TwitterTrawler(b)
  
      await twitterTrawler.getResults(null)
        .then(() => {
          throw new Error ("Should not get here")
        })
        .catch((e) => {
          e.message.should.equal('Failed to load results: (503) "Simulated 503 error"')
        })
    });
  
    it.skip('reports if Twitter request times out', function (done) {
  
      nockRet.socketDelay(20000)
      .reply(503, 'Simulated internal delay')
  
      twitterTrawler = new TwitterTrawler(b)
  
      twitterTrawler.getResults(null, function (e,tweets) {
        e.should.equal('Failed to load results: Error: ESOCKETTIMEDOUT')
        done();
      })
    });
  
  
    it('reports if Twitter returned a bad response due to client error', async function () {
  
      var twitterRespBody = {
        "errors":[{
          "code":34,
          "message":"Sorry, that page does not exist."}]}
  
      nockRet.reply(404,twitterRespBody)
      twitterTrawler = new TwitterTrawler(b)
  
      await twitterTrawler.getResults(null)
        .then (() => {
          throw new Error("Should not get here")
        })
        .catch((e) => {
          e.message.should.equal('Failed to load results: (404) ' + JSON.stringify(twitterRespBody))
        })
    });
  
    afterEach (function () {
      nock.cleanAll()
      b = null
      twitterTrawler = null
    })
  
  });
  
})