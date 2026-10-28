import { App } from "obsidian";
export function delay(ms: number) {
    return new Promise( resolve => window.setTimeout(resolve, ms) );
}

export function partition<T>(array: T[], isValid: (el: T) => boolean) :T[][] {
	const pass: T[] = [];
	const fail: T[] = [];
	for (const elem of array) {
		(isValid(elem) ? pass : fail).push(elem);
	}
	return [pass, fail];
}

export async function asyncFilter<T>(arr:T[], predicate:(e:T)=>Promise<boolean>) {
	const results = await Promise.all(arr.map(predicate));

	return arr.filter((_v, index) => results[index]);
}



export  function getFolders(app: App):string[]{
    //@ts-ignore
    const files = app.vault.adapter.files;
    const folders = [];
    for(const key in files){
        if(files[key].type === "folder"){
            folders.push(files[key].realpath);
        }
    }
    return folders;
}
