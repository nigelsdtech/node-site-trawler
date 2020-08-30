const
  chai          = require('chai'),
  SiteTrawler   = require('../../../../lib/classes/SiteTrawler.js');

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

  var s, b, mt, lr

  var multipleTweets = [
    {id: 1, contents: "Masterclass this sunday"},
    {id: 2, contents: "Masterclass this monday"},
    {id: 3, contents: "New plectrums for sale"}
  ]
  
  beforeEach (function () {
    b  = Object.assign({},basicSiteTrawler)
    mt = multipleTweets.slice()
    lr = function (p, cb) { this.results = mt.slice(); cb(null) }
  })


  it('returns valid results for all tweets ', function (done) {

    s = new SiteTrawler(b)
    s.loadResults = lr

    s.getResults(null, function (e,tweets) {
      tweets.should.deep.equal([
        {id: 1, contents: "Masterclass this sunday"},
        {id: 2, contents: "Masterclass this monday"},
        {id: 3, contents: "New plectrums for sale"}
      ])
      done();
    })
  });


  it('applies a custom filter to some results', function (done) {

    s = new SiteTrawler(b)
    s.loadResults = lr
    s.resultPassesCustomFilters = function (p) { if (p.result.contents.match(/.*Masterclass.*/)) { return true } else { return false } }

    s.getResults(null, function (e,tweets) {
      tweets.should.deep.equal([
        {id: 1, contents: "Masterclass this sunday"},
        {id: 2, contents: "Masterclass this monday"},
      ])
      done();
    })
  });

  it('applies a custom filter to all results', function (done) {

    s = new SiteTrawler(b)
    s.loadResults = lr
    s.resultPassesCustomFilters = function (p) { return (p.result.contents.match(/.*concert.*/) > 5) }

    s.getResults(null, function (e,tweets) {
      tweets.should.deep.equal([])
      done();
    })
  });

  it('returns no results if the service had none', function (done) {

    s = new SiteTrawler(b)
    s.loadResults = function (p,cb) { cb(null) }

    s.getResults(null, function (e,tweets) {
      tweets.should.deep.equal([])
      done();
    })
  });

  it('reports if service failed for any reason', function (done) {

    s = new SiteTrawler(b)
    s.loadResults = function (p,cb) { cb('Simulated failure') }

    s.getResults(null, function (e,tweets) {
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

describe('SiteTrawler.getDataToSaveToSpreadsheet', function () {

  it('returns null by default (users are forced to write an override)', function () {
     var s = new SiteTrawler(basicSiteTrawler)
     const data = s.getDataToSaveToSpreadsheet()
     chai.expect(data).to.equal(null)
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


describe('SiteTrawler.getRollCallValues', function () {

  const names = [
    "Geddy",
    "Alex",
    "Neil"
  ]
  const attendeeFieldToTest = 'name'
  const valueForAbsentees = { instrument: 'tambourine' }

  const tests = [{
    testName: 'All attendees are found (regardless of order)',
    inputResults: [
      {name: 'Alex',  instrument: 'guitar'},
      {name: 'Geddy', instrument: 'bass'},
      {name: 'Neil',  instrument: 'drums'}
    ],
    expectedResponse: [
      {name: 'Geddy', instrument: 'bass'},
      {name: 'Alex',  instrument: 'guitar'},
      {name: 'Neil',  instrument: 'drums'}
    ]
  },{
    testName: "One attendee isn't found and is given a default value",
    inputResults: [
      {name: 'Geddy', instrument: 'bass'},
      {name: 'Neil',  instrument: 'drums'}
    ],
    expectedResponse: [
      {name: 'Geddy', instrument: 'bass'},
      {name: 'Alex',  instrument: 'tambourine'},
      {name: 'Neil',  instrument: 'drums'}
    ]
  },{
    testName: "All are absent and are given a default value",
    inputResults: [],
    expectedResponse: [
      {name: 'Geddy', instrument: 'tambourine'},
      {name: 'Alex',  instrument: 'tambourine'},
      {name: 'Neil',  instrument: 'tambourine'}
    ]
  }]

  const s = new SiteTrawler(basicSiteTrawler)

  tests.forEach ( ({
    testName,
    only = false,
    inputResults,
    expectedResponse = "Response hasn't been defined",
  }) => {

    const itFn = (only)? it.only : it ;

    itFn(testName, () => {

      const gotResp = s.getRollCallValues ({
        names,
        attendeeFieldToTest,
        valueForAbsentees,
        attendees: inputResults
      })

      gotResp.should.eql(expectedResponse)

   })
  })


})