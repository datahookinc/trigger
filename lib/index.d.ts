/** Autoincrementing _id required for tables */
type AUTOID = number;
type TableNotify = 'onInsert' | 'onDelete' | 'onUpdate';
type RowNotify = 'onUpdate' | 'onDelete';
type AllowedPrimitives<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : T extends Date ? Date : T extends null ? null : never;
type IsAllowedObject<T> = T extends NewableFunction | CallableFunction | Map<unknown, unknown> | Set<unknown> | WeakMap<object, unknown> | WeakSet<object> ? false : true;
type AllowedType2<T> = T extends AllowedPrimitives<T> ? T : T extends Array<infer U> ? Array<AllowedType2<U>> : IsAllowedObject<T> extends false ? 'Functions, Maps, Sets, WeakMaps, and WeakSets are not allowed types in Trigger' : UserRow<T>;
type UserRow<T> = {
    [P in keyof T]: AllowedType2<T[P]>;
};
export type FetchStatus = 'idle' | 'error' | 'loading' | 'success';
export type TableRow<T> = {
    [K in keyof T]: T[K];
} & {
    _id: number;
};
/**
 * Default values:
 * {
 *    refreshOn: [],
 *    refreshMode: 'replace'
 *    resetIndex: false,
 *    where: null,
 *    notify: [],
 *    refetchOnMount: boolean;
 *    onSuccess: () => void;
 *    resultsFilter: (row: TableRow<T>) => boolean
 * }
 */
type TableRefreshOptions<T> = {
    refreshOn?: unknown[];
    refreshMode?: 'replace' | 'append';
    resetIndex?: boolean;
    notify?: TableNotify[];
    fetchOnMount?: boolean;
    onSuccess?(): void;
    filter?: (row: TableRow<T>) => boolean;
};
/**
 * Default values:
 * {
 *  batchNotify: true,
 *  render: true,
 * }
 */
type UpdateManyOptions = {
    batchNotify?: boolean;
    render?: boolean;
};
export type DefinedTable<T> = {
    [K in keyof T]: T[K][];
};
export type Table<T extends UserRow<T>> = {
    use(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, notify?: TableNotify[]): TableRow<T>[];
    useById(_id: AUTOID, notify?: RowNotify[]): TableRow<T> | undefined;
    useLoadData(queryFn: () => Promise<T[]> | undefined, options?: TableRefreshOptions<T>): {
        data: TableRow<T>[];
        status: FetchStatus;
        error: string | null;
    };
    insertOne(row: T): TableRow<T> | undefined;
    insertMany(rows: T[], batchNotify?: boolean): TableRow<T>[];
    onBeforeInsert(fn: (row: TableRow<T>) => TableRow<T> | void | boolean): void;
    onAfterInsert(fn: (row: TableRow<T>) => void): void;
    deleteById(_id: AUTOID): boolean;
    deleteOne(where: Partial<T> | ((row: TableRow<T>) => boolean)): boolean;
    deleteMany(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, batchNotify?: boolean): number;
    onBeforeDelete(fn: (row: TableRow<T>) => boolean | void): void;
    onAfterDelete(fn: (row: TableRow<T>) => void): void;
    updateById(_id: AUTOID, setValue: Partial<T> | ((row: TableRow<T>) => Partial<T>), render?: boolean): TableRow<T> | undefined;
    updateMany(setValue: Partial<T> | ((row: TableRow<T>) => Partial<T>), where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, options?: UpdateManyOptions): TableRow<T>[];
    onBeforeUpdate(fn: (currentValue: TableRow<T>, newValue: TableRow<T>) => TableRow<T> | void | boolean): void;
    onAfterUpdate(fn: (previousValue: TableRow<T>, newValue: TableRow<T>) => void): void;
    findById(_id: AUTOID): TableRow<T> | undefined;
    findOne(where?: Partial<T> | ((v: TableRow<T>) => boolean)): TableRow<T> | undefined;
    find(where?: Partial<T> | ((v: TableRow<T>) => boolean)): TableRow<T>[];
    count(where?: Partial<T> | ((v: TableRow<T>) => boolean)): number;
    columnNames(): (keyof TableRow<T>)[];
    print(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, n?: number): void;
    toJSON(index?: boolean, where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, n?: number): string;
    clear(resetIndex?: boolean): void;
    scan(fn: (row: TableRow<T>, idx: number) => boolean | void): void;
};
export declare function CreateTable<T extends UserRow<T>>(t: DefinedTable<T> | (keyof T)[]): Table<T>;
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
    use(where?: (currentValue: T) => boolean | undefined): T;
    set(newValue: T): T;
    setFn(fn: (currentValue: T) => T): T;
    onSet(fn: (previousValue: T, newValue: T) => void): void;
    onGet(fn: (value: T) => void): void;
    get(): T;
};
export declare function CreateSingle<T>(s: T): Single<T>;
type IsTriggerType<T> = T extends ReturnType<() => UserRow<T>> ? true : T extends Queue<unknown> ? true : T extends Single<unknown> ? true : false;
type TriggerStore<T> = {
    [K in keyof T]: IsTriggerType<T[K]> extends true ? Readonly<T[K]> : T[K];
};
export declare function CreateStore<T extends TriggerStore<T>>(t: T): TriggerStore<T>;
export {};
