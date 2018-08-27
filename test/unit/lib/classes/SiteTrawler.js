var cfg           = require('config');
var chai          = require('chai');
var SiteTrawler   = require('../../../../lib/classes/SiteTrawler.js');

/*
 * Set up chai
 */
chai.should();


// Common testing timeout
var timeout = 5*1000;

var basicSiteTrawler = {
  subClassSetup: {
    id         : "Twitter, John Petrucci, Masterclass",
    maxResults : 10
  }
}



describe('SiteTrawler.getResults', function () {

  var s, b, mt

  var multipleTweets = [
    {id: 1, contents: "Masterclass this sunday"},
    {id: 2, contents: "Masterclass this monday"},
    {id: 3, contents: "New plectrums for sale"}
  ]
  
  beforeEach (function () {
    b  = Object.assign({},basicSiteTrawler)
    mt = multipleTweets.slice()
  })


  it('returns valid results for all tweets ', function (done) {

    s = new SiteTrawler(b)
    s.loadResults = function (p, cb) { cb(null, mt) }

    s.getResults(null, function (e,stop) {
      s.results.should.deep.equal([
        {id: 1, contents: "Masterclass this sunday"},
        {id: 2, contents: "Masterclass this monday"},
        {id: 3, contents: "New plectrums for sale"}
      ])
      done();
    })
  });


  it('applies a custom filter to some results', function (done) {

    s = new SiteTrawler(b)
    s.loadResults = function (p,cb) { cb(null, mt) }
    s.resultPassesCustomFilters = function (p) { if (p.result.contents.match(/.*Masterclass.*/)) { return true } else { return false } }

    s.getResults(null, function (e,stop) {
      s.results.should.deep.equal([
        {id: 1, contents: "Masterclass this sunday"},
        {id: 2, contents: "Masterclass this monday"},
      ])
      done();
    })
  });

  it('applies a custom filter to all results', function (done) {

    s = new SiteTrawler(b)
    s.loadResults = function (p,cb) { cb(null, mt) }
    s.resultPassesCustomFilters = function (p) { if (p.result.contents.match(/.*concert.*/) > 5) { return true } else { return false } }

    s.getResults(null, function (e,stop) {
      s.results.should.deep.equal([])
      done();
    })
  });

  it('returns no results if the service had none none', function (done) {

    s = new SiteTrawler(b)
    s.loadResults = function (p,cb) { cb(null, []) }

    s.getResults(null, function (e,stop) {
      s.results.should.deep.equal([])
      done();
    })
  });

  it('reports if service failed for any reason', function (done) {

    s = new SiteTrawler(b)
    s.loadResults = function (p,cb) { cb('Simulated failure') }

    s.getResults(null, function (e,stop) {
      e.should.equal('Failed to load results: Simulated failure')
      done();
    })
  });


  afterEach (function () {
    b = null
    s = null
  })


})


describe('SiteTrawler.getResultsString', function () {

  it('throws an error by default (users are forced to write an override)', function () {
     var s = new SiteTrawler(basicSiteTrawler)
     chai.expect(s.getResultsString.bind(s,null)).to.throw('getResultsString needs to be overridden')
  })

});


describe('SiteTrawler.loadResults', function () {

  it('returns an error by default (users are forced to write an override)', function (done) {
     var s = new SiteTrawler(basicSiteTrawler)
     s.loadResults(null, function (err, ret) {
       err.should.equal('loadResults needs to be overridden')
       done()
     })
  })

})



describe('SiteTrawler.resultPassesCustomFilters', function () {

  it('returns true by default (users are forced to write an override)', function () {
     var s = new SiteTrawler(basicSiteTrawler)
     s.resultPassesCustomFilters(null).should.equal(true)
  })

})
