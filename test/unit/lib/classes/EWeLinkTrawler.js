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
    {"pattern" : "^Device .* battery and (not )?online and switch (on|off)$", "flags": "gi" }
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
        "Device low battery and not online and switch on",
        "Device low battery and not online and switch off",
        "Device low battery and online and switch on",
        "Device low battery and online and switch off",
        "Device high battery and not online and switch on",
        "Device high battery and not online and switch off",
        "Device high battery and online and switch on",
        "Device high battery and online and switch off"
      ])
    });


    it('returns devices with low battery when the batteryFilterThreshold is specified', async () => {

      const opts = Object.assign({},b,{batteryFilterThreshold: 0.1})
      const devices = await getDeviceNames({opts:opts})

      devices.should.have.members([
        "Device low battery and not online and switch on",
        "Device low battery and not online and switch off",
        "Device low battery and online and switch on",
        "Device low battery and online and switch off"
      ])

    });


    it('returns devices with low battery when the batteryFilterThreshold is specified or that are active if that option is specified', async () => {

      const opts = Object.assign({}, b, { batteryFilterThreshold: 0.1, alwaysReportIfOn: true });
      const devices = await getDeviceNames({opts: opts});

      devices.should.have.members([
        "Device low battery and not online and switch on",
        "Device low battery and not online and switch off",
        "Device low battery and online and switch on",
        "Device low battery and online and switch off",
        "Device high battery and not online and switch on",
        "Device high battery and online and switch on"
      ]);

    });

    it('returns devices that are not online if alwaysReportIfNotOnline is specified, even when battery is above the threshold', async () => {

      const opts = Object.assign({}, b, { batteryFilterThreshold: 0.1, alwaysReportIfNotOnline: true });
      const devices = await getDeviceNames({opts: opts});

      devices.should.have.members([
        "Device low battery and not online and switch on",
        "Device low battery and not online and switch off",
        "Device low battery and online and switch on",
        "Device low battery and online and switch off",
        "Device high battery and not online and switch on",
        "Device high battery and not online and switch off"
      ]);

    });

    it('returns no results if eWeLink returns nothing', async () => {

    const opts = Object.assign({}, b);
    const devices = await getDeviceNames({opts: opts, eWeLinkResponse: []});

    devices.should.deep.equal([])
  });
  
})
  
  describe('getDataToSaveToSpreadsheet', function () {
  
    this.timeout(timeout)
    
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
      deviceNames: [
        "Device low battery and not online and switch on",
        "Device low battery and not online and switch off",
        "Device low battery and online and switch on",
        "Device low battery and online and switch off",
        "Device high battery and not online and switch on",
        "Device high battery and not online and switch off",
        "Device high battery and online and switch on",
        "Device high battery and online and switch off"
      ],
      expectedResponse: [0.01,0.05,0.03,0.07,2.637,1.637,2.637,1.637]
    },{
      testDesc: 'fills out absentee values for absentees',
      deviceNames: [
        "Non existant device",
        "Device low battery and not online and switch on",
        "Device low battery and not online and switch off",
        "Non existant device 2",
        "Device low battery and online and switch on",
        "Device low battery and online and switch off",
        "Device high battery and not online and switch on",
        "Device high battery and not online and switch off",
        "Device high battery and online and switch on",
        "Device high battery and online and switch off"
      ],
      expectedResponse: [null,0.01,0.05,null,0.03,0.07,2.637,1.637,2.637,1.637]
    }]
  
    tests.forEach( ({
      testDesc,
      only = false,
      deviceNames,
      attendeeFieldToTest = 'name',
      expectedResponse
    }) => {
  
      const itFn = (only)? it.only : it;
  
      itFn(testDesc, async function () {
  
        const init = Object.assign({},basicClassInstantiation, {
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


  describe('getResults', function () {
  
    this.timeout(timeout)
    
    const tests = [{
      testDesc: 'returns a string for no results',
      results: [],
      expectedResponse: ""
    },{
      testDesc: 'returns a string for one result',
      results: [
        {
          name: "Device low battery and not online and switch on",
          battery: 0.5,
          id: "d1",
          switchStatus: "on",
          online: false,
          lastUpdate: "2020-08-17T23:46:05.895Z"
        }
      ],
      expectedResponse: "<br>Device low battery and not online and switch on: Battery 0.5, Switch on, <b>offline</b>"

    },{
      testDesc: 'returns a string for many results',
      results: [
        {
          name: "Device low battery and not online and switch on",
          battery: 0.5,
          id: "d1",
          switchStatus: "on",
          online: false,
          lastUpdate: "2020-08-17T23:46:05.895Z"
        },{
          name: "Device high battery and online and switch on",
          battery: 2.5,
          id: "d2",
          switchStatus: "on",
          online: true,
          lastUpdate: "2020-08-17T23:46:05.895Z"
        },{
          name: "Device high battery and not online and switch off",
          battery: 1.5,
          id: "d3",
          switchStatus: "off",
          online: false,
          lastUpdate: "2020-08-17T23:46:05.895Z"
        }
      ],
      expectedResponse: ""
        + "<br>Device low battery and not online and switch on: Battery 0.5, Switch on, <b>offline</b>"
        + "<br>Device high battery and online and switch on: Battery 2.5, Switch on, online"
        + "<br>Device high battery and not online and switch off: Battery 1.5, Switch off, <b>offline</b>"

    }]
  
    tests.forEach( ({
      testDesc,
      only = false,
      results,
      expectedResponse
    }) => {
  
      const itFn = (only)? it.only : it;
  
      itFn(testDesc, () => {
  
        const init = Object.assign({},basicClassInstantiation)
  
        const eWeLinkTrawler = new EWeLinkTrawler(init)
        eWeLinkTrawler.results = results

        const resultsString = eWeLinkTrawler.getResultsString()
        resultsString.should.eql(expectedResponse)
        
      });
  
    })
  
  
  
  })
})