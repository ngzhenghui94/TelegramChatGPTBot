declare class Authenticator {
    private email;
    private password;
    private client;
    private jar;
    private userAgent;
    private accessToken;
    constructor(email: string, password: string);
    private static urlEncode;
    begin(): Promise<void>;
    private partOne;
    private partTwo;
    private partThree;
    private partFour;
    private partFive;
    getAccessToken(): Promise<string>;
}

export { Authenticator as default };
