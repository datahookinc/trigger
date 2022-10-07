/** Autoincrementing primary key required for tables */
declare type PK = number;
declare type TableNotify = 'rowInsert' | 'rowDelete' | 'rowUpdate';
declare type RowNotify = 'rowUpdate' | 'rowDelete';
declare type AllowedPrimitives = string | number | Date | boolean | null;
declare type TableEntry = {
    [index: string]: AllowedPrimitives;
} & {
    _pk: PK;
};
export interface Store {
    tables?: {
        [index: string]: TriggerTable<ReturnType<(<T extends TableEntry>() => T)>>;
    };
    queues?: {
        [index: string]: TriggerQueue<unknown>;
    };
    singles?: {
        [index: string]: TriggerSingle<unknown>;
    };
}
export declare type DefinedTable<T> = {
    [K in keyof T]: T[K][];
};
export declare type TriggerTable<T extends TableEntry> = {
    useTable(where: ((v: T) => boolean) | null, notify?: TableNotify[]): T[];
    useTableRow(pk: PK, notify?: RowNotify[]): T | undefined;
    insertTableRow(r: {
        [Property in keyof T as Exclude<Property, '_pk'>]: T[Property];
    }): T;
    onInsert(fn: (v: T) => void): void;
    deleteTableRow(pk: PK): boolean;
    updateTableRow(pk: PK, valueMap: {
        [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property];
    }): boolean;
    findTableRows(where: {
        [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property];
    } | ((v: T) => boolean)): T[];
    findTableRow(where: {
        [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property];
    } | ((v: T) => boolean)): T | undefined;
};
export declare function CreateTable<T extends TableEntry>(t: DefinedTable<T>): TriggerTable<T>;
export declare type TriggerQueueItem<T> = {
    item: T;
    cb?: (ok: boolean) => void;
};
export declare type TriggerQueue<T> = {
    insert(item: T, cb?: (ok: boolean) => void): boolean;
    onInsert(fn: (v: T) => void): void;
    get(): TriggerQueueItem<T> | undefined;
    onGet(fn: (v: T) => void): void;
    size(): number;
};
/** NewTriggerQueue is a wrapper for creating a new trigger queue that will be managed by the store
 *
 * @returns TriggerQueue<T>
 */
export declare function CreateQueue<T>(): TriggerQueue<T>;
export declare type TriggerSingle<T> = {
    use(): T;
    set(v: T): boolean;
    onSet(fn: (v: T) => void): void;
    onGet(fn: (v: T) => void): void;
    get(): T;
};
export declare function CreateSingle<T>(s: T): TriggerSingle<T>;
declare type ExtractTables<T> = {
    readonly [K in keyof Omit<T, 'onInsert'>]: T[K] extends Record<PropertyKey, unknown> ? ExtractTables<T[K]> : T[K];
};
export declare function extractTables<T extends Store['tables']>(t: T): ExtractTables<T>;
declare type ExtractQueues<T> = {
    readonly [K in keyof Omit<T, 'onInsert' | 'onGet'>]: T[K] extends Record<PropertyKey, unknown> ? ExtractQueues<T[K]> : T[K];
};
export declare function extractQueues<T extends Store['queues']>(t: T): ExtractQueues<T>;
declare type ExtractSingles<T> = {
    readonly [K in keyof Omit<T, 'onSet' | 'onGet'>]: T[K] extends Record<PropertyKey, unknown> ? ExtractSingles<T[K]> : T[K];
};
export declare function extractSingles<T extends Store['singles']>(t: T): ExtractSingles<T>;
export {};
