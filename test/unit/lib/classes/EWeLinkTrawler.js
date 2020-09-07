const
  cfg             = require('config'),
  chai            = require('chai'),
  jsonFile        = require('jsonfile'),
  {promisify}     = require('util'),
  ewelinkApi      = require('ewelink-api'),
  sinon           = require('sinon'),
  EWeLinkTrawler  = require('../../../../lib/classes/EWeLinkTrawler.js');

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

const responseData = jsonFile.readFileSync('./test/data/ewelink/responseSonoff.json')


/*
 * The actual tests
 */

describe('EWeLinkTrawler', () => {
  
  describe('getResults', function () {

    this.timeout(timeout)
  
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
  
  
  
  describe('getDataToSaveToSpreadsheet', function () {
  
    this.timeout(timeout)
  
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
  
    const tests = [{
      testDesc: 'returns the expected spreadsheet row when all devices have a response',
      deviceNames: ['Fridge door', 'Freezer door', 'Second Fridge door', 'Second Freezer door'],
      expectedResponse: [2.651,2.637,0.09,2.651]
    },{
      testDesc: 'fills out absentee values for absentees',
      deviceNames: ['Fridge door', 'Freezer door', 'Non existant door', 'Second Freezer door'],
      expectedResponse: [2.651,2.637,null,2.651]
    }]
  
    tests.forEach( ({
      testDesc,
      only = false,
      deviceNames,
      attendeeFieldToTest = 'name',
      expectedResponse
    }) => {
  
      const itFn = (only)? it.only : it;
  
      it(testDesc, async function () {
  
        const init = Object.assign({},b, {
          rollCall : {
            attendeeFieldToTest,
            names: deviceNames
          }
        })
  
        const eWeLinkTrawler = new EWeLinkTrawler(init)
        const gr = promisify(eWeLinkTrawler.getResults).bind(eWeLinkTrawler)
    
        getDevicesStub.resolves(responseData)
    
        await gr(null)
        
        const [date, ...batteryData] = eWeLinkTrawler.getDataToSaveToSpreadsheet()
    
        const d = new Date().toISOString().replace('T',' ').split('.')[0]
        date.should.eql(d)
        const re = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
        const matched = re.test(d)
        matched.should.be.true
  
        batteryData.should.eql(expectedResponse)
        
      });
  
    })
  
  
  
  })
  
  
})