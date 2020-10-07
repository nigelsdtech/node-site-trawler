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
var timeout = cfg.timeout || (2*1000);

var basicClassInstantiation = {
  id: "doorSensorChecker",
  username: "fakePerson",
  password: "fakePassword",
  region: "eu",
  regexMatches: [
    {"pattern" : "^Device .* battery and o.*$", "flags": "gi" }
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

  /**
   * 
   * @param {Object} params
   * @param {Object} params.opts - initializer for the ewelink object
   * @param {Object} params.eWeLinkResponse - stubbed response from EWeLink
   * @returns {Promise<string[]>} - list of device names
   */
  function getDeviceNames ({opts,eWeLinkResponse = responseData}) {

    const ew = new EWeLinkTrawler(opts)
    getDevicesStub.resolves(eWeLinkResponse)

    const gr = promisify(ew.getResults).bind(ew)
    const devices = gr(null)
      .then ((devices) => {
        return devices.map((d) => {return d.name})
      })
      .catch((e) => {throw e})

    return devices
  }

  it('returns devices matching the regex criteria', async () => {

    const devices = await getDeviceNames({opts: Object.assign({},b)})

    devices.should.have.members([
      "Device low battery and on",
      "Device low battery and on 2",
      "Device low battery and off",
      "Device low battery and off 2",
      "Device high battery and on",
      "Device high battery and on 2",
      "Device high battery and off",
      "Device high battery and off 2"
    ])
  });


  it('returns devices with low battery when the batteryFilterThreshold is specified', async () => {

    const opts = Object.assign({},b,{batteryFilterThreshold: 0.1})
    const devices = await getDeviceNames({opts:opts})

    devices.should.have.members([
      "Device low battery and on",
      "Device low battery and on 2",
      "Device low battery and off",
      "Device low battery and off 2"
    ])

  });


  it('returns devices with low battery when the batteryFilterThreshold is specified or that are active if that option is specified', async () => {

    const opts = Object.assign({}, b, { batteryFilterThreshold: 0.1, alwaysReportIfOn: true });
    const devices = await getDeviceNames({opts: opts});

    devices.should.have.members([
      "Device low battery and on",
      "Device low battery and on 2",
      "Device low battery and off",
      "Device low battery and off 2",
      "Device high battery and on",
      "Device high battery and on 2"
    ]);

  });

  it('returns devices that are off if alwaysReportIfOff is specified, even when battery is above the threshold', async () => {

    const opts = Object.assign({}, b, { batteryFilterThreshold: 0.1, alwaysReportIfOff: true });
    const devices = await getDeviceNames({opts: opts});

    devices.should.have.members([
      "Device low battery and on",
      "Device low battery and on 2",
      "Device low battery and off",
      "Device low battery and off 2",
      "Device high battery and off",
      "Device high battery and off 2"
    ]);

  });

  it('returns no results if eWeLink returns nothing', async () => {

    const opts = Object.assign({}, b);
    const devices = await getDeviceNames({opts: opts, eWeLinkResponse: []});

    devices.should.deep.equal([])
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