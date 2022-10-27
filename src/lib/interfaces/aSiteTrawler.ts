export abstract class aSiteTrawler {
    
    id: string;

    constructor({Object}): () => void,
    applyResultTransformation: (params: {result: Object}) => Promise<Object>,
    getDataToSave: () => Object[],
    getDataToSaveToSpreadsheet: () => Object[] | null,
    getResults: () => Promise<Object[] | null>,
    getResultsString: () => string,
    getRollCallValues: iGetRollCallValues,
    loadResults: (params: null, cb: cbFunction) => void,
    log: (level: string, msg: string) => void
    resultPassesCommonFilters: iResultPassesCommonFilters,
    resultPassesCustomFilters: (params: Object) => Promise<boolean>,
    setSavedData: ({savedData: Object}) => void
}

interface cbFunction {
    (err: String | null, cb?: Function): void
}

interface iConstructor {
    (params: {
        subClassSetup: {
            id: number,
        }
    }): void
}

interface iGetRollCallValues {
    (params: {
        names: string[],
        attendeeFieldToTest: string,
        valueForAbsentees: any,
        attendees: Object[]

    }): Object[]
}

interface iResultPassesCommonFilters {
    (params: {
        result: {
            id: String
        }
    }): boolean
}