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
        [index: string]: Table<ReturnType<(<T extends TableEntry>() => T)>>;
    };
    queues?: {
        [index: string]: Queue<unknown>;
    };
    singles?: {
        [index: string]: Single<unknown>;
    };
}
export declare type DefinedTable<T> = {
    [K in keyof T]: T[K][];
};
export declare type Table<T extends TableEntry> = {
    use(where: ((v: T) => boolean) | null, notify?: TableNotify[]): T[];
    useRow(pk: PK, notify?: RowNotify[]): T | undefined;
    insertRow(r: Omit<T, '_pk'>): T | undefined;
    insertRows(r: Omit<T, '_pk'>[], batch?: boolean): T[];
    onBeforeInsert(fn: (v: T) => T | void | boolean): void;
    onAfterInsert(fn: (v: T) => void): void;
    deleteRow(where: PK | Partial<Omit<T, '_pk'>> | ((v: T) => boolean)): boolean;
    deleteRows(where?: Partial<Omit<T, '_pk'>> | ((v: T) => boolean), batch?: boolean): number;
    onDelete(fn: (v: T) => void): void;
    updateRow(pk: PK, newValue: Partial<Omit<T, '_pk'>> | ((v: T) => Partial<Omit<T, '_pk'>>)): T | undefined;
    updateRows(setValue: Partial<Omit<T, '_pk'>> | ((v: T) => Partial<Omit<T, '_pk'>>), where?: Partial<Omit<T, '_pk'>> | ((v: T) => boolean), batch?: boolean): T[];
    onUpdate(fn: (v: T) => void): void;
    getRows(where?: Partial<Omit<T, '_pk'>> | ((v: T) => boolean)): T[];
    getRow(where: PK | Partial<Omit<T, '_pk'>> | ((v: T) => boolean)): T | undefined;
    getRowCount(where?: Partial<Omit<T, '_pk'>> | ((v: T) => boolean)): number;
};
export declare function CreateTable<T extends TableEntry>(t: DefinedTable<T>): Table<T>;
export declare type QueueItem<T> = {
    item: T;
    cb?: (ok: boolean) => void;
};
export declare type Queue<T> = {
    insert(item: T, cb?: (ok: boolean) => void): boolean;
    onInsert(fn: (v: T) => void): void;
    get(): QueueItem<T> | undefined;
    onGet(fn: (v: T) => void): void;
    size(): number;
};
/** NewTriggerQueue is a wrapper for creating a new trigger queue that will be managed by the store
 *
 * @returns TriggerQueue<T>
 */
export declare function CreateQueue<T>(): Queue<T>;
export declare type Single<T> = {
    use(): T;
    set(v: T): boolean;
    onSet(fn: (v: T) => void): void;
    onGet(fn: (v: T) => void): void;
    get(): T;
};
export declare function CreateSingle<T>(s: T): Single<T>;
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
declare type Extracted<T extends Store> = {
    tables: ExtractTables<T['tables']>;
    singles: ExtractSingles<T['singles']>;
    queues: ExtractQueues<T['queues']>;
};
export declare function extract<T extends Store>(t: T): Extracted<T>;
export {};
