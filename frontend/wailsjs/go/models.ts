export namespace main {
	
	export class AppSettings {
	    language: string;
	    launchAtStartup: boolean;
	    darkMode: boolean;
	    closeBehavior: string;
	    appDataPath: string;
	    configTomlMode: string;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.language = source["language"];
	        this.launchAtStartup = source["launchAtStartup"];
	        this.darkMode = source["darkMode"];
	        this.closeBehavior = source["closeBehavior"];
	        this.appDataPath = source["appDataPath"];
	        this.configTomlMode = source["configTomlMode"];
	    }
	}
	export class LastAction {
	    type: string;
	    profileId?: string;
	    profileName?: string;
	    backupDir?: string;
	
	    static createFrom(source: any = {}) {
	        return new LastAction(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.profileId = source["profileId"];
	        this.profileName = source["profileName"];
	        this.backupDir = source["backupDir"];
	    }
	}
	export class ProfileMetadata {
	    id: string;
	    name: string;
	    createdAt: string;
	    updatedAt: string;
	    sortOrder: number;
	    authMode?: string;
	    lastRefresh?: string;
	    apiKeyMasked?: string;
	    tokenKeys?: string[];
	    fingerprint?: string;
	    identityKey?: string;
	    accountId?: string;
	    userId?: string;
	    email?: string;
	    planType?: string;
	    usage?: UsageSummary;
	    usageError?: string;
	    usageUpdatedAt?: string;
	    isActive?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ProfileMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.sortOrder = source["sortOrder"];
	        this.authMode = source["authMode"];
	        this.lastRefresh = source["lastRefresh"];
	        this.apiKeyMasked = source["apiKeyMasked"];
	        this.tokenKeys = source["tokenKeys"];
	        this.fingerprint = source["fingerprint"];
	        this.identityKey = source["identityKey"];
	        this.accountId = source["accountId"];
	        this.userId = source["userId"];
	        this.email = source["email"];
	        this.planType = source["planType"];
	        this.usage = this.convertValues(source["usage"], UsageSummary);
	        this.usageError = source["usageError"];
	        this.usageUpdatedAt = source["usageUpdatedAt"];
	        this.isActive = source["isActive"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UsageWindow {
	    limitName?: string;
	    usedPercent: number;
	    remainingPercent: number;
	    windowMinutes: number;
	    resetsAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new UsageWindow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.limitName = source["limitName"];
	        this.usedPercent = source["usedPercent"];
	        this.remainingPercent = source["remainingPercent"];
	        this.windowMinutes = source["windowMinutes"];
	        this.resetsAt = source["resetsAt"];
	    }
	}
	export class UsageSummary {
	    accountId?: string;
	    email?: string;
	    planType?: string;
	    fiveHour?: UsageWindow;
	    weekly?: UsageWindow;
	
	    static createFrom(source: any = {}) {
	        return new UsageSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accountId = source["accountId"];
	        this.email = source["email"];
	        this.planType = source["planType"];
	        this.fiveHour = this.convertValues(source["fiveHour"], UsageWindow);
	        this.weekly = this.convertValues(source["weekly"], UsageWindow);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StateSummary {
	    authMode?: string;
	    lastRefresh?: string;
	    apiKeyMasked?: string;
	    tokenKeys?: string[];
	    fingerprint?: string;
	    identityKey?: string;
	    accountId?: string;
	    userId?: string;
	    email?: string;
	    planType?: string;
	    usage?: UsageSummary;
	    usageError?: string;
	
	    static createFrom(source: any = {}) {
	        return new StateSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.authMode = source["authMode"];
	        this.lastRefresh = source["lastRefresh"];
	        this.apiKeyMasked = source["apiKeyMasked"];
	        this.tokenKeys = source["tokenKeys"];
	        this.fingerprint = source["fingerprint"];
	        this.identityKey = source["identityKey"];
	        this.accountId = source["accountId"];
	        this.userId = source["userId"];
	        this.email = source["email"];
	        this.planType = source["planType"];
	        this.usage = this.convertValues(source["usage"], UsageSummary);
	        this.usageError = source["usageError"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class LaunchTarget {
	    kind: string;
	    target: string;
	
	    static createFrom(source: any = {}) {
	        return new LaunchTarget(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.target = source["target"];
	    }
	}
	export class RuntimeProcess {
	    ProcessName: string;
	    Id: number;
	    Path?: string;
	
	    static createFrom(source: any = {}) {
	        return new RuntimeProcess(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ProcessName = source["ProcessName"];
	        this.Id = source["Id"];
	        this.Path = source["Path"];
	    }
	}
	export class RuntimeSummary {
	    runningCount: number;
	    running: RuntimeProcess[];
	    launchTarget?: LaunchTarget;
	
	    static createFrom(source: any = {}) {
	        return new RuntimeSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.runningCount = source["runningCount"];
	        this.running = this.convertValues(source["running"], RuntimeProcess);
	        this.launchTarget = this.convertValues(source["launchTarget"], LaunchTarget);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AppState {
	    codexHome: string;
	    defaultAppDataPath: string;
	    appDataPath: string;
	    appVersion: string;
	    settings: AppSettings;
	    trackedFiles: string[];
	    runtime: RuntimeSummary;
	    current: StateSummary;
	    profiles: ProfileMetadata[];
	    lastAction?: LastAction;
	
	    static createFrom(source: any = {}) {
	        return new AppState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.codexHome = source["codexHome"];
	        this.defaultAppDataPath = source["defaultAppDataPath"];
	        this.appDataPath = source["appDataPath"];
	        this.appVersion = source["appVersion"];
	        this.settings = this.convertValues(source["settings"], AppSettings);
	        this.trackedFiles = source["trackedFiles"];
	        this.runtime = this.convertValues(source["runtime"], RuntimeSummary);
	        this.current = this.convertValues(source["current"], StateSummary);
	        this.profiles = this.convertValues(source["profiles"], ProfileMetadata);
	        this.lastAction = this.convertValues(source["lastAction"], LastAction);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	
	

}

