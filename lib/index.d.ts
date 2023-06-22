/** Autoincrementing primary key required for tables */
type PK = number;
type TableNotify = 'rowInsert' | 'rowDelete' | 'rowUpdate';
type RowNotify = 'rowUpdate' | 'rowDelete';
type AllowedPrimitives = string | number | Date | boolean | null;
type UserRow = {
    [index: string]: AllowedPrimitives;
};
export type FetchStatus = 'idle' | 'error' | 'loading' | 'success';
export type TableRow<T> = {
    [K in keyof T]: T[K];
} & {
    _pk: number;
};
export interface Store {
    tables?: {
        [index: string]: Table<ReturnType<(<T extends UserRow>() => T)>>;
    };
    queues?: {
        [index: string]: Queue<unknown>;
    };
    singles?: {
        [index: string]: Single<unknown>;
    };
}
type TableRefreshOptions = {
    refreshOn?: unknown[];
    refreshMode?: 'replace' | 'append';
    resetIndex?: boolean;
};
export type DefinedTable<T> = {
    [K in keyof T]: T[K][];
};
export type Table<T extends UserRow> = {
    use(where?: ((row: TableRow<T>) => boolean) | null, notify?: TableNotify[]): TableRow<T>[];
    useLoadData(queryFn: () => Promise<T[]> | undefined, options?: TableRefreshOptions): {
        data: TableRow<T>[] | null;
        status: FetchStatus;
        error: string | null;
    };
    useRow(_pk: PK, notify?: RowNotify[]): TableRow<T> | undefined;
    insertRow(row: T): TableRow<T> | undefined;
    insertRows(rows: T[], batchNotify?: boolean): TableRow<T>[];
    onBeforeInsert(fn: (row: TableRow<T>) => TableRow<T> | void | boolean): void;
    onAfterInsert(fn: (row: TableRow<T>) => void): void;
    deleteRow(where: PK | Partial<T> | ((row: TableRow<T>) => boolean)): boolean;
    deleteRows(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, batchNotify?: boolean): number;
    onBeforeDelete(fn: (row: TableRow<T>) => boolean | void): void;
    onAfterDelete(fn: (row: TableRow<T>) => void): void;
    updateRow(_pk: PK, setValue: Partial<T> | ((row: TableRow<T>) => Partial<T>)): TableRow<T> | undefined;
    updateRows(setValue: Partial<T> | ((row: TableRow<T>) => Partial<T>), where?: Partial<T> | ((row: TableRow<T>) => boolean), batchNotify?: boolean): TableRow<T>[];
    onBeforeUpdate(fn: (currentValue: TableRow<T>, newValue: TableRow<T>) => TableRow<T> | void | boolean): void;
    onAfterUpdate(fn: (previousValue: TableRow<T>, newValue: TableRow<T>) => void): void;
    getRow(where: PK | Partial<T> | ((v: TableRow<T>) => boolean)): TableRow<T> | undefined;
    getRows(where?: Partial<T> | ((v: TableRow<T>) => boolean)): TableRow<T>[];
    getRowCount(where?: Partial<T> | ((v: TableRow<T>) => boolean)): number;
    getColumnNames(): (keyof TableRow<T>)[];
    print(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, n?: number): void;
    clear(resetIndex?: boolean): void;
};
export declare function CreateTable<T extends UserRow>(t: DefinedTable<T> | (keyof T)[]): Table<TableRow<T>>;
export type QueueItem<T> = {
    item: T;
    cb?: (ok: boolean) => void;
};
export type Queue<T> = {
    insert(item: T, cb?: (ok: boolean) => void): boolean;
    onInsert(fn: (newItem: T) => void): void;
    /** returns the next item in the queue or undefined if the queue is empty */
    get(): T | undefined;
    onGet(fn: (item: T) => void): void;
    size(): number;
};
/** NewTriggerQueue is a wrapper for creating a new trigger queue that will be managed by the store
 *
 * @returns TriggerQueue<T>
 */
export declare function CreateQueue<T>(): Queue<T>;
export type Single<T> = {
    use(): T;
    set(newValue: T): T;
    setFn(fn: (currentValue: T) => T): T;
    onSet(fn: (newValue: T) => void): void;
    onGet(fn: (value: T) => void): void;
    get(): T;
};
export declare function CreateSingle<T>(s: T): Single<T>;
type ExtractTables<T> = {
    readonly [K in keyof Omit<T, 'onInsert'>]: T[K] extends Record<PropertyKey, unknown> ? ExtractTables<T[K]> : T[K];
};
export declare function extractTables<T extends Store['tables']>(t: T): ExtractTables<T>;
type ExtractQueues<T> = {
    readonly [K in keyof Omit<T, 'onInsert' | 'onGet'>]: T[K] extends Record<PropertyKey, unknown> ? ExtractQueues<T[K]> : T[K];
};
export declare function extractQueues<T extends Store['queues']>(t: T): ExtractQueues<T>;
type ExtractSingles<T> = {
    readonly [K in keyof Omit<T, 'onSet' | 'onGet'>]: T[K] extends Record<PropertyKey, unknown> ? ExtractSingles<T[K]> : T[K];
};
export declare function extractSingles<T extends Store['singles']>(t: T): ExtractSingles<T>;
type Extracted<T extends Store> = {
    tables: ExtractTables<T['tables']>;
    singles: ExtractSingles<T['singles']>;
    queues: ExtractQueues<T['queues']>;
};
export declare function extract<T extends Store>(t: T): Extracted<T>;
export {};
