var cfg             = require('config');
var chai            = require('chai');
var fs              = require('fs');
var nock            = require('nock');
var GumtreeTrawler  = require('../../../../lib/classes/GumtreeTrawler.js');
var Q               = require('q');

/*
 * Set up chai
 */
chai.should();


// Common testing timeout
var timeout = cfg.timeout || (20*1000);

var gumtreeHost = "https://www.gumtree.com"

var basicSearch = {
  id           : "turntable-Gumtree",
  maxResults   : 10,
  gtQuery      : "sort=date&q=microwave",
  regexMatches : [{
    pattern: "^((?!(Sharp)).)*$", flags: "gi"}]
}



/*
 * The actual tests
 */

describe('GumtreeTrawler.getResults', function () {

  this.timeout(timeout)

  var listingData = fs.readFileSync("./test/data/gumtree/results_1.html")

  var gumtreeTrawler, b, nockRet

  beforeEach (function () {
    nockRet = nock(gumtreeHost)
      .persist()
      .get("/search")
      .query({
        "sort": "date",
        "q": "microwave"
      })

    b = Object.assign({},basicSearch)
    gumtreeTrawler = new GumtreeTrawler(b)
  })


  it('returns all listings', function (done) {

    nockRet.reply(200,listingData)

    gumtreeTrawler.getResults(null, function (e,listings) {

      var ret = []
      listings.forEach(function(t) { ret.push(t.url) })

      ret.should.have.members([
        "https://www.gumtree.com/p/microwave-ovens/microwave/1277743165",
        "https://www.gumtree.com/p/microwave-ovens/swan-800w-microwave/1277607915",
        "https://www.gumtree.com/p/microwave-ovens/microwave-for-sale/1277359886",
        "https://www.gumtree.com/p/microwave-ovens/microwave-morphy-richards-category-e/1276063061",
      ])
      done();
    });
  });

  it('filters out listings already seen', function (done) {

    nockRet.reply(200,listingData)

    gumtreeTrawler.setSavedData({
      savedData: {
        seenIds: [
          "https://www.gumtree.com/p/microwave-ovens/microwave-for-sale/1277359886",
          "https://www.gumtree.com/p/microwave-ovens/microwave-morphy-richards-category-e/1276063061",
      ]}
    })


    gumtreeTrawler.getResults(null, function (e,listings) {

      var ret = []
      listings.forEach(function(t) { ret.push(t.id) })

      ret.should.have.members([
        "https://www.gumtree.com/p/microwave-ovens/microwave/1277743165",
        "https://www.gumtree.com/p/microwave-ovens/swan-800w-microwave/1277607915",
      ])
      done();
    })
  });

  it('appends the new results to the set of seen ids', function (done) {

    nockRet.reply(200,listingData)

    gumtreeTrawler.setSavedData({
      savedData: {
        seenIds: [
          "Some dud A",
          "https://www.gumtree.com/p/microwave-ovens/microwave-for-sale/1277359886",
          "Some dud B",
          "https://www.gumtree.com/p/microwave-ovens/microwave-morphy-richards-category-e/1276063061"
      ]}
    })


    gumtreeTrawler.getResults(null, function (e,listings) {

      gumtreeTrawler.getDataToSave().seenIds.should.have.members([
        "Some dud A",
        "https://www.gumtree.com/p/microwave-ovens/microwave-for-sale/1277359886",
        "Some dud B",
        "https://www.gumtree.com/p/microwave-ovens/microwave-morphy-richards-category-e/1276063061",
        "https://www.gumtree.com/p/microwave-ovens/microwave/1277743165",
        "https://www.gumtree.com/p/microwave-ovens/swan-800w-microwave/1277607915"
      ])
      done();
    })
  });

  it('still makes requests correctly when optional arguments aren\'t passed in', function (done) {

    nockRet.reply(200,listingData)

    delete b['maxResults']
    gumtreeTrawler = new GumtreeTrawler(b)

    gumtreeTrawler.getResults(null, function (e,listings) {

      var ret = []
      listings.forEach(function(t) { ret.push(t.url) })

      ret.should.have.members([
        "https://www.gumtree.com/p/microwave-ovens/microwave/1277743165",
        "https://www.gumtree.com/p/microwave-ovens/swan-800w-microwave/1277607915",
        "https://www.gumtree.com/p/microwave-ovens/microwave-for-sale/1277359886",
        "https://www.gumtree.com/p/microwave-ovens/microwave-morphy-richards-category-e/1276063061"
      ])
      done();
    })
  });

  it('returns no listings', function (done) {

    nockRet.reply(200,[])

    gumtreeTrawler.getResults(null, function (e,listings) {
      listings.should.deep.equal([])
      done();
    })
  });

  it('reports if Gumtree returned a bad response due to internal error', function (done) {

    nockRet.reply(503,'Simulated 503 error')

    gumtreeTrawler.getResults(null, function (e,listings) {
      e.should.equal('Failed to load results: (503) "Simulated 503 error"')
      done();
    })
  });

  it.skip('reports if Gumtree request times out', function (done) {

    nockRet.socketDelay(20000)
    .reply(503, 'Simulated internal delay')

    gumtreeTrawler = new GumtreeTrawler(b)

    gumtreeTrawler.getResults(null, function (e,listings) {
      e.should.equal('Failed to load results: Error: ESOCKETTIMEDOUT')
      done();
    })
  });


  afterEach (function () {
    nock.cleanAll()
    b = null
    gumtreeTrawler = null
  })

});
