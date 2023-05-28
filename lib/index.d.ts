/** Autoincrementing primary key required for tables */
type PK = number;
type TableNotify = 'rowInsert' | 'rowDelete' | 'rowUpdate';
type RowNotify = 'rowUpdate' | 'rowDelete';
type AllowedPrimitives = string | number | Date | boolean | null;
type UserEntry = {
    [index: string]: AllowedPrimitives;
};
export type TableEntry<T> = {
    [K in keyof T]: T[K];
} & {
    _pk: number;
};
export interface Store {
    tables?: {
        [index: string]: Table<ReturnType<(<T extends UserEntry>() => T)>>;
    };
    queues?: {
        [index: string]: Queue<unknown>;
    };
    singles?: {
        [index: string]: Single<unknown>;
    };
}
export type DefinedTable<T> = {
    [K in keyof T]: T[K][];
};
export type Table<T extends UserEntry> = {
    use(where?: ((v: TableEntry<T>) => boolean) | null, notify?: TableNotify[]): TableEntry<T>[];
    useRow(pk: PK, notify?: RowNotify[]): TableEntry<T> | undefined;
    insertRow(r: T): TableEntry<T> | undefined;
    insertRows(r: T[], batchNotify?: boolean): TableEntry<T>[];
    onBeforeInsert(fn: (v: TableEntry<T>) => TableEntry<T> | void | boolean): void;
    onAfterInsert(fn: (v: TableEntry<T>) => void): void;
    deleteRow(where: PK | Partial<T> | ((v: TableEntry<T>) => boolean)): boolean;
    deleteRows(where?: Partial<T> | ((v: TableEntry<T>) => boolean), batchNotify?: boolean): number;
    onBeforeDelete(fn: (v: TableEntry<T>) => boolean | void): void;
    onAfterDelete(fn: (v: TableEntry<T>) => void): void;
    updateRow(pk: PK, newValue: Partial<T> | ((v: TableEntry<T>) => Partial<T>)): TableEntry<T> | undefined;
    updateRows(setValue: Partial<T> | ((v: TableEntry<T>) => Partial<T>), where?: Partial<T> | ((v: TableEntry<T>) => boolean), batchNotify?: boolean): TableEntry<T>[];
    onBeforeUpdate(fn: (currentValue: TableEntry<T>, newValue: TableEntry<T>) => TableEntry<T> | void | boolean): void;
    onAfterUpdate(fn: (previousValue: TableEntry<T>, newValue: TableEntry<T>) => void): void;
    getRows(where?: Partial<T> | ((v: TableEntry<T>) => boolean)): TableEntry<T>[];
    getRow(where: PK | Partial<T> | ((v: TableEntry<T>) => boolean)): TableEntry<T> | undefined;
    getRowCount(where?: Partial<T> | ((v: TableEntry<T>) => boolean)): number;
    getColumnNames(): (keyof TableEntry<T>)[];
};
export declare function CreateTable<T extends UserEntry>(t: DefinedTable<T>): Table<TableEntry<T>>;
export type QueueItem<T> = {
    item: T;
    cb?: (ok: boolean) => void;
};
export type Queue<T> = {
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
export type Single<T> = {
    use(): T;
    set(newValue: T): T;
    setFn(fn: (currentValue: T) => T): T;
    onSet(fn: (v: T) => void): void;
    onGet(fn: (v: T) => void): void;
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
