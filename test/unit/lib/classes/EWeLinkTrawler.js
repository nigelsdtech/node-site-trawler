var cfg             = require('config');
var chai            = require('chai');
var jsonFile        = require('jsonfile');
var ewelinkApi      = require('ewelink-api');
var sinon           = require('sinon');
var EWeLinkTrawler  = require('../../../../lib/classes/EWeLinkTrawler.js');

/*
 * Set up chai
 */
chai.should();


// Common testing timeout
var timeout = cfg.timeout || (20*1000);

var basicClassInstantiation = {
  id: "doorSensorChecker",
  username: "fakePerson",
  password: "fakePassword",
  region: "eu",
  regexMatches: [
    {"pattern" : "Fridge door", "flags": "gi" },
    {"pattern" : "Freezer door", "flags": "gi" },
    {"pattern" : "Back Fridge door", "flags": "gi" },
    {"pattern" : "Back Freezer door", "flags": "gi" },
  ]
}


/*
 * The actual tests
 */

describe('EWeLinkTrawler.getResults', function () {

  this.timeout(timeout)

  const responseData = jsonFile.readFileSync('./test/data/ewelink/responseSonoff.json')
  const b = Object.assign({},basicClassInstantiation)
  
  var getDevicesStub
  
  before (function () {
    getDevicesStub = sinon.stub(ewelinkApi.prototype,"getDevices")
  })

  afterEach (function () {
    getDevicesStub.reset()
  })
  after (function () {
    getDevicesStub.restore()
  })


  it('returns devices matching the regex criteria', function (done) {

    const eWeLinkTrawler = new EWeLinkTrawler(b)
    getDevicesStub.resolves(responseData)

    eWeLinkTrawler.getResults(null, function (e,devices) {

      const ret = devices.map((d) => {return d.name})

      ret.should.have.members([
        "Fridge door",
        "Freezer door",
        "Second Fridge door",
        "Second Freezer door"
      ])
    })
    done();
  });

  it('returns devices under the battery criteria', function (done) {

    const eWeLinkTrawler = new EWeLinkTrawler(Object.assign({},b,{batteryFilterThreshold: 0.1}))
    getDevicesStub.resolves(responseData)

    eWeLinkTrawler.getResults(null, function (e,devices) {

      const ret = devices.map((d) => {return d.name})

      ret.should.have.members([
        "Second Fridge door"
      ])
    })
    done();
  });

  it('returns devices under the battery criteria and active devices', function (done) {

    const eWeLinkTrawler = new EWeLinkTrawler(Object.assign({},b,{
      batteryFilterThreshold: 0.1,
      alwaysReportIfOn: true
    }))
    getDevicesStub.resolves(responseData)

    eWeLinkTrawler.getResults(null, function (e,devices) {

      const ret = devices.map((d) => {return d.name})

      ret.should.have.members([
        "Freezer door",
        "Second Fridge door",
        "Second Freezer door"
      ])
      done();
    })
  });

  it('returns no results', function (done) {

    const eWeLinkTrawler = new EWeLinkTrawler(b)
    getDevicesStub.resolves([])

    eWeLinkTrawler.getResults(null, function (e,devices) {
      devices.should.deep.equal([])
      done();
    })
  });


});
