import { useState, useRef, useEffect } from 'react';

/** Autoincrementing primary key required for tables */
type PK = number;

type TableNotify = 'rowInsert' | 'rowDelete' | 'rowUpdate';
type RowNotify = 'rowUpdate' | 'rowDelete';
/** Notify is a union of the available notification events that can be subscribed to
 * - rowInsert
 * - rowDelete
 * - rowUpdate
 */
type Notify = TableNotify | RowNotify;

type TableTrigger = 'onDelete' | 'onUpdate' | 'onInsert';
type SingleTrigger = 'onGet' | 'onSet';
type QueueTrigger = 'onInsert' | 'onGet';

type Subscribe<T> = {
    notify: Notify[];
    fn(v: T): void;
};

type SingleSubscribe<T> = (v: T) => void;

type AllowedPrimitives = string | number | Date | boolean | null;

// TODO: see if this needs to be exported or not
type TableEntry = { [index: string]: AllowedPrimitives } & { _pk: PK };

export interface Store {
    tables?: {
        [index: string]: TriggerTable<ReturnType<<T extends TableEntry>() => T>>;
    };
    queues?: {
        [index: string]: TriggerQueue<unknown>;
    };
    singles?: {
        [index: string]: TriggerSingle<unknown>;
    };
}

export type DefinedTable<T> = { [K in keyof T]: T[K][] }; // This is narrowed during CreateTable to ensure it extends TableEntry

export type TriggerTable<T extends TableEntry> = {
    useTable(where: ((v: T) => boolean) | null, notify?: TableNotify[]): T[];
    useTableRow(pk: PK, notify?: RowNotify[]): T | undefined;
    insertTableRow(r: { [Property in keyof T as Exclude<Property, '_pk'>]: T[Property] }): T;
    onInsert(fn: (v: T) => void): void;
    deleteTableRow(pk: PK): boolean;
    updateTableRow(pk: PK, valueMap: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] }): boolean;
    findTableRows(where: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] } | ((v: T) => boolean)): T[];
    findTableRow(where: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] } | ((v: T) => boolean)): T | undefined;
};

// This might work out that the triggers just need to send back the value, we don't need to provide the API because the user can do whatever they want as a normal function.
export function CreateTable<T extends TableEntry>(t: DefinedTable<T>): TriggerTable<T> {
    const table: DefinedTable<T> = t;
    const columnNames: (keyof T)[] = Object.keys(t);
    const tableSubscribers: Subscribe<T[]>[] = [];
    const rowSubscribers: Record<PK, Subscribe<T | undefined>[]> = {};
    const triggers: { [Property in TableTrigger]?: (v: T) => void } = {};
    let autoPK: PK = 0;

    const getTable = (): T[] => {
        const entries: Record<string, AllowedPrimitives>[] = [];
        for (let i = 0, numValues = table['_pk'].length; i < numValues; i++) {
            const entry = {} as T;
            for (let j = 0, numArrays = columnNames.length; j < numArrays; j++) {
                entry[columnNames[j]] = table[columnNames[j]][i];
            }
            entries.push(entry);
        }
        return entries as T[];
    };

    const getTableRowCount = (): number => {
        return table['_pk'].length;
    };

    /**
     * Convenience function for returning a table row based on the provided table and index.
     * The function will return undefined if the provided index is out of range (e.g., greater than the number of rows in the table)
     * @param idx
     * @returns TableRow | undefined
     */
    function getTableRowByIndex(idx: number): T | undefined {
        if (idx < getTableRowCount()) {
            const entry = {} as T;
            for (const k of columnNames) {
                entry[k] = table[k][idx];
            }
            return entry;
        }
        return undefined;
    }

    const getTableRow = (pk: PK): T | undefined => {
        if (table) {
            let idx = -1;
            for (let i = 0, len = table._pk.length; i < len; i++) {
                if (table._pk[i] === pk) {
                    idx = i;
                    break;
                }
            }
            if (idx >= 0) {
                return getTableRowByIndex(idx);
            }
        }
        return undefined;
    };

    const tableHasChanged = (oldValues: T[], newValues: T[]): boolean => {
        if (oldValues.length !== newValues.length) {
            return true;
        }
        for (let i = 0, len = oldValues.length; i < len; i++) {
            const ov = oldValues[i];
            const nv = newValues[i];
            for (const k in ov) {
                if (ov[k] !== nv[k]) {
                    return true;
                }
            }
        }
        return false;
    };

    const registerTable = (fn: (v: T[]) => void, notify: TableNotify[]) => {
        tableSubscribers.push({
            notify,
            fn,
        });
    };

    const unregisterTable = (fn: (v: T[]) => void) => {
        tableSubscribers.filter((d) => d.fn !== fn);
    };

    const notifyTableSubscribers = (ne: TableNotify) => {
        const subs = tableSubscribers.filter((s) => s.notify.length === 0 || s.notify.includes(ne));
        if (subs.length > 0) {
            const rows = getTable(); // PERFORMANCE: One of the downsides is we end-up creating a lot of objects each time the table changes
            for (let i = 0, len = subs.length; i < len; i++) {
                subs[i].fn(rows);
            }
        }
    };

    const notifyRowSubscribers = (ne: RowNotify, pk: PK) => {
        if (rowSubscribers[pk].length > 0) {
            const subs = rowSubscribers[pk].filter((s) => s.notify.length === 0 || s.notify.includes(ne));
            if (subs.length > 0) {
                const row = getTableRow(pk);
                for (let i = 0, len = subs.length; i < len; i++) {
                    subs[i].fn(row);
                }
            }
        }
    };

    const registerRow = (pk: PK, fn: (v: T) => void, notify: RowNotify[]) => {
        if (!rowSubscribers[pk]) {
            rowSubscribers[pk] = [];
        }

        rowSubscribers[pk].push({
            notify,
            fn,
        });
    };

    const unregisterRow = (pk: PK, fn: (v: T) => void) => {
        if (rowSubscribers[pk]) {
            rowSubscribers[pk] = rowSubscribers[pk].filter((d) => d.fn !== fn);
            if (rowSubscribers[pk].length === 0) {
                delete rowSubscribers[pk]; // remove the property entirely if there are no listeners
            }
        }
    };

    return {
        useTable(where: ((v: T) => boolean) | null, notify: TableNotify[] = []): T[] {
            const [v, setV] = useState<T[]>(() => (where ? getTable().filter(where) : getTable())); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid exhaustive-deps warning, and to avoid calling useEffect everytime v changes
            const hasChanged = useRef((newValues: T[]) => tableHasChanged(v, newValues));
            const notifyList = useRef(notify);
            const whereClause = useRef(where);
            hasChanged.current = (newValues: T[]) => tableHasChanged(v, newValues);

            useEffect(() => {
                const subscribe = (nv: T[]) => {
                    if (whereClause.current) {
                        // compare to see if changes effect rows this component is hooking into
                        const filtered = nv.filter(whereClause.current);
                        if (hasChanged.current(filtered)) {
                            setV(nv.filter(whereClause.current));
                        }
                    } else {
                        setV(nv);
                    }
                };

                registerTable(subscribe, notifyList.current);

                // NOTE: Initialize here because of the delay between useState and useEffect which means
                // changes could have been dispatched before this component was registered to listen for them
                const currentTableValues = whereClause.current ? getTable().filter(whereClause.current) : getTable();
                setV(currentTableValues);
                // unregister when component unmounts;
                return () => {
                    unregisterTable(subscribe);
                };
            }, [t]);
            return v;
        },
        useTableRow(pk: PK, notify: RowNotify[] = []): T | undefined {
            const [v, setV] = useState<T | undefined>(() => getTableRow(pk)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid firing useEffect when the notify object reference changes
            const notifyList = useRef(notify);

            useEffect(() => {
                const subscribe = (nv: T | undefined) => {
                    setV(nv);
                };
                registerRow(pk, subscribe, notifyList.current);
                setV(getTableRow(pk));
                // unregister when component unmounts;
                return () => {
                    unregisterRow(pk, subscribe);
                };
            }, [t, pk]);
            return v;
        },
        insertTableRow(newRow: { [Property in keyof T as Exclude<Property, '_pk'>]: T[Property] }): T {
            for (const k in newRow) {
                table[k].push(newRow[k]);
            }
            table['_pk'].push(++autoPK);

            // add the primary key and send it back
            const entry = {
                _pk: autoPK,
                ...newRow,
            } as T;

            // pass entry to trigger
            if (triggers['onInsert']) {
                triggers['onInsert'](entry);
            }

            notifyTableSubscribers('rowInsert');
            // return the entry to the calling function
            return entry;
        },
        deleteTableRow(pk: number): boolean {
            let idx = -1;
            // find the idx where the pk exists in this table
            for (let i = 0, len = table._pk.length; i < len; i++) {
                if (table._pk[i] === pk) {
                    idx = i;
                }
            }
            if (idx >= 0) {
                for (const k of columnNames) {
                    table[k].splice(idx, 1);
                }

                notifyRowSubscribers('rowDelete', pk);
                notifyTableSubscribers('rowDelete');
                return true;
            }
            return false;
        },
        updateTableRow(pk: PK, valueMap: { [Property in keyof T as Exclude<Property, '_pk'>]: T[Property] }): boolean {
            for (const k in valueMap) {
                if (!columnNames.includes(k)) {
                    console.error(`Invalid column provided "${k}"`);
                    return false;
                }
            }
            let idx = -1;
            // find the idx where the pk exists in this table
            for (let i = 0, len = table._pk.length; i < len; i++) {
                if (table._pk[i] === pk) {
                    idx = i;
                }
            }
            if (idx >= 0) {
                // Note: the user is protected from sending unknown or incompatible properties, it is just this update piece that is being problematic
                for (const k in valueMap) {
                    if (table[k] !== undefined && k !== '_pk') {
                        const v = valueMap[k];
                        if (v !== undefined) {
                            table[k][idx] = v;
                        }
                    }
                }
                notifyRowSubscribers('rowUpdate', pk);
                notifyTableSubscribers('rowUpdate');
                return true;
            }
            return false;
        },
        findTableRows(where: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] } | ((v: T) => boolean)): T[] {
            const numRows = getTableRowCount();
            if (numRows > 0) {
                if (typeof where === 'function') {
                    const entries: T[] = [];
                    // loop through the rows until we find a matching index, returns the first match if any
                    for (let i = 0, len = numRows; i < len; i++) {
                        const entry = getTableRowByIndex(i);
                        if (entry && where(entry)) {
                            entries.push(entry);
                        }
                    }
                    return entries;
                }

                if (typeof where == 'object') {
                    const keys = Object.keys(where);
                    if (keys.length === 0) {
                        return [];
                    } else {
                        // make sure the requested columns exist in the table; if they don't all exist, return undefined
                        for (const k of keys) {
                            if (!columnNames.includes(k)) {
                                return [];
                            }
                        }
                        const entries: T[] = [];
                        // loop through the rows looking for indexes that match
                        for (let i = 0, len = numRows; i < len; i++) {
                            let allMatch = true;
                            for (const k of keys) {
                                if (where[k] !== table[k][i]) {
                                    allMatch = false;
                                    break;
                                }
                            }
                            if (allMatch) {
                                const entry = getTableRowByIndex(i);
                                if (entry) {
                                    entries.push(entry);
                                }
                            }
                        }
                        return entries;
                    }
                }
            }
            return [];
        },
        findTableRow(where: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] } | ((v: T) => boolean)): T | undefined {
            const numRows = getTableRowCount();
            if (numRows > 0) {
                let idx = -1;
                switch (typeof where) {
                    case 'function': {
                        // loop through the rows until we find a matching index, returns the first match if any
                        const entry = {} as T;
                        for (let i = 0, len = numRows; i < len; i++) {
                            for (const k of columnNames) {
                                entry[k] = table[k][i];
                            }
                            if (where(entry)) {
                                idx = i;
                                break;
                            }
                        }
                        break;
                    }
                    case 'object': {
                        const keys = Object.keys(where);
                        if (keys.length === 0) {
                            return undefined;
                        } else {
                            // make sure the requested columns exist in the table; if they don't all exist, return undefined
                            for (const k of keys) {
                                if (!columnNames.includes(k)) {
                                    return undefined;
                                }
                            }
                            // loop through the rows until we find a matching index, returns the first match if any
                            for (let i = 0, len = numRows; i < len; i++) {
                                let allMatch = true;
                                for (const k of keys) {
                                    if (where[k] !== table[k][i]) {
                                        allMatch = false;
                                        break;
                                    }
                                }
                                if (allMatch) {
                                    idx = i;
                                    break;
                                }
                            }
                        }
                        break;
                    }
                    default: {
                        return undefined;
                    }
                }
                if (idx >= 0) {
                    const entry = getTableRowByIndex(idx);
                    if (entry) {
                        return entry;
                    }
                    return undefined;
                }
            }
        },
        onInsert(fn: (v: T) => void) {
            triggers['onInsert'] = fn;
        },
    };
}

export type TriggerQueueItem<T> = {
    item: T;
    cb?: (ok: boolean) => void;
};

export type TriggerQueue<T> = {
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
export function CreateQueue<T>(): TriggerQueue<T> {
    const q: TriggerQueueItem<T>[] = [];
    const triggers: { [Property in QueueTrigger]?: (v: T) => void } = {};

    return {
        insert(item: T, cb?: (ok: boolean) => void): boolean {
            q.push({ item, cb });
            // pass entry to trigger
            if (triggers['onInsert']) {
                triggers['onInsert'](item);
            }
            return true;
        },
        get(): TriggerQueueItem<T> | undefined {
            const item = q.shift();
            if (item) {
                // pass entry to trigger
                if (triggers['onGet']) {
                    triggers['onGet'](item.item);
                }
            }
            return item;
        },
        size(): number {
            return q.length;
        },
        onInsert(fn: (v: T) => void) {
            triggers['onInsert'] = fn;
        },
        onGet(fn: (v: T) => void) {
            triggers['onGet'] = fn;
        },
    };
}

export type TriggerSingle<T> = {
    use(): T;
    set(v: T): boolean;
    onSet(fn: (v: T) => void): void;
    onGet(fn: (v: T) => void): void;
    get(): T;
};

export function CreateSingle<T>(s: T): TriggerSingle<T> {
    let single = s;
    let subscribers: SingleSubscribe<T>[] = [];
    const triggers: { [Property in SingleTrigger]?: (v: T) => void } = {};

    // Note: singles always fire when they are set
    const registerSingle = (fn: SingleSubscribe<T>) => {
        subscribers.push(fn);
    };

    // It seems like it might be here? My unregisters aren't working properly?
    const unregisterSingle = (fn: SingleSubscribe<T>) => {
        subscribers = subscribers.filter((d) => d !== fn);
    };

    const notifySubscribers = (v: T) => {
        for (let i = 0, len = subscribers.length; i < len; i++) {
            subscribers[i](v);
        }
    };

    return {
        use(): T {
            const [v, setV] = useState<T>(() => single); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            useEffect(() => {
                const subscribe = (nv: T) => {
                    setV(nv);
                };
                registerSingle(subscribe);
                setV(single);
                // unregister when component unmounts;
                return () => {
                    unregisterSingle(subscribe);
                };
            });
            return v;
        },
        get(): T {
            // pass entry to trigger
            if (triggers['onGet']) {
                triggers['onGet'](single);
            }
            return single;
        },
        set(v: T): boolean {
            if (triggers['onSet']) {
                triggers['onSet'](single);
            }
            notifySubscribers(v); // we pass the value to save extra function calls within notifySingleSubscribers
            single = v;
            return true;
        },
        onSet(fn: (v: T) => void) {
            triggers['onSet'] = fn;
        },
        onGet(fn: (v: T) => void) {
            triggers['onGet'] = fn;
        },
    };
}

// ExtractTables changes properties to readonly and removes properties that should not be exposed
type ExtractTables<T> = {
    readonly [K in keyof Omit<T, 'onInsert'>]: T[K] extends Record<PropertyKey, unknown> ? ExtractTables<T[K]> : T[K]; // omit the trigger functions because the user shouldn't be exposed to those.
};

export function extractTables<T extends Store['tables']>(t: T): ExtractTables<T> {
    return t;
}

// ExtractQueueschanges properties to readonly and removes properties that should not be exposed
type ExtractQueues<T> = {
    readonly [K in keyof Omit<T, 'onInsert' | 'onGet'>]: T[K] extends Record<PropertyKey, unknown> ? ExtractQueues<T[K]> : T[K]; // omit the trigger functions because the user shouldn't be exposed to those.
};

export function extractQueues<T extends Store['queues']>(t: T): ExtractQueues<T> {
    return t;
}

// ExtractQueueschanges properties to readonly and removes properties that should not be exposed
type ExtractSingles<T> = {
    readonly [K in keyof Omit<T, 'onSet' | 'onGet'>]: T[K] extends Record<PropertyKey, unknown> ? ExtractSingles<T[K]> : T[K]; // omit the trigger functions because the user shouldn't be exposed to those.
};

export function extractSingles<T extends Store['singles']>(t: T): ExtractSingles<T> {
    return t;
}
