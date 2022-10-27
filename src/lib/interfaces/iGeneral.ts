export type cbFunction = {
    (err: String | null, cb?: Function): void
}

export interface websiteScraperConstructorArgs {
    id: string,
    maxResults?: number,
    siteQuery: string,
    regexMatches: {
        pattern: RegExp,
        flags: string
    }[],
    regexMatchField: string
}