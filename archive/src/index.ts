import { useState, useRef, useEffect } from 'react';

type TableEntries = { [index: string]: Table };
type SingleEntries = { [index: string]: any };
type QueueEntries = { [index: string]: TriggerQueue<any> };

// type StoreEntry = Store["models"][number]; how we can get the type of an element in an array
type TableName = Extract<keyof TableEntries, string>; // here to prevent TypeScript from using string | number as index
type SingleName = Extract<keyof SingleEntries, string>; // here to prevent TypeScript from using string | number as index
type QueueName = Extract<keyof QueueEntries, string>; // here to prevent TypeScript from using string | number as index
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

/** Trigger is a union of the available triggers for a table
 * - onDelete
 * - onUpdate
 * - onInsert
 */
type TableTrigger = 'onDelete' | 'onUpdate' | 'onInsert';
type SingleTrigger = 'onGet' | 'onSet';
type QueueTrigger = 'onInsert' | 'onGet';

type Subscribe = {
    notify: Notify[];
    fn(v: any): void;
};

type TableRow = Record<string, AllowedPrimitives>;

enum ErrorCode {
    UnknownTable = 'Unknown Table',
    UnknownQueue = 'Unknown Queue',
    UnknownSingle = 'Unknown Single',
    TableRowNotFound = 'Table Row Not Found',
}

type ErrorMessage = {
    code: ErrorCode;
    message: string;
};

// Utils is a convenient structure for working with the declared names on the store
export interface Utils {
    tables: { [index in TableName]: TableName };
    singles: { [index in SingleName]: SingleName };
    queues: { [index in QueueName]: QueueName };
}

export type AllowedPrimitives = string | number | Date | boolean | null;

// TODO: see if this needs to be exported or not
export type Table = { [index: string]: Array<AllowedPrimitives> } & {
    /** The numbers you enter are quite in-cons-e-quential (Dr. Evil); the engine will autoassign and autoincrement them for you */
    _pk: Array<PK>;
}; // tables hold arrays

// TODO: someway to prevent infinite triggers (e.g., inserts/updates that keep calling themselves);
export interface Store {
    tables?: TableEntries;
    triggers?: {
        tables?: Record<TableName, { [Property in TableTrigger]?: (api: TriggerAPI, v: any) => void }>; //  LEFT-OFF: setting unknown here is problematic because now I can't interact with my safe types in the trigger function
        singles?: Record<SingleName, { [Property in SingleTrigger]?: (api: TriggerAPI, v: any) => void }>;
        queues?: Record<QueueName, { [Property in QueueTrigger]?: (api: TriggerAPI, v: any) => void }>;
    };
    singles?: SingleEntries;
    queues?: QueueEntries;
}

type API = {
    registerTable(tName: TableName, fn: (v: any[]) => void, notify: Notify[]): void;
    registerRow(tName: TableName, pk: PK, fn: (v: any) => void, notify: Notify[]): void;
    registerSingle(sName: SingleName, fn: (v: any) => void): void;
    unregisterRow(tName: TableName, pk: PK, fn: (v: any) => void): void;
    unregisterTable(tName: TableName, fn: (v: any[]) => void): void;
    unregisterSingle(sName: SingleName, fn: (v: any) => void): void;
    getTable<T extends Record<string, AllowedPrimitives>>(t: TableName): T[];
    getTableRow<T extends Record<string, AllowedPrimitives>>(t: TableName, pk: PK): T | undefined;
    findTableRow<T extends Record<string, AllowedPrimitives>>(
        t: TableName,
        where: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] } | ((v: T) => boolean),
    ): T | undefined;
    findTableRows<T extends Record<string, AllowedPrimitives>>(
        tName: TableName,
        where: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] } | ((v: T) => boolean),
    ): T[];
    insertTableRow<T extends Record<string, AllowedPrimitives>>(
        tName: TableName,
        valueMap: { [Property in keyof T as Exclude<Property, '_pk'>]: T[Property] },
    ): T | undefined;
    insertTableRows<T extends Record<string, AllowedPrimitives>>(
        tName: TableName,
        valueMap: Array<{ [Property in keyof T as Exclude<Property, '_pk'>]: T[Property] }>,
    ): T[];
    updateTableRow<T extends Record<string, AllowedPrimitives>>(
        tName: TableName,
        pk: PK,
        valueMap: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] },
    ): boolean;
    deleteTableRow(tName: TableName, pk: PK): boolean;
    clearTable(tName: TableName): boolean;
    getSingle<T>(sName: SingleName): T | undefined;
    setSingle<T>(sName: SingleName, value: T): boolean;
    tableHasChanged<T>(oldValues: T[], newValues: T[]): boolean;
    insertQueueItem<T>(qName: string, item: T, cb?: (ok: boolean) => void): boolean;
    getQueueItem<T>(qName: string): TriggerQueueItem<T> | undefined;
    getQueueSize(qName: string): number;
};

export type TriggerAPI = {
    getTable: API['getTable'];
    getTableRow: API['getTableRow'];
    findTableRow: API['findTableRow'];
    findTableRows: API['findTableRows'];
    insertTableRow: API['insertTableRow'];
    updateTableRow: API['updateTableRow'];
    deleteTableRow: API['deleteTableRow'];
    clearTable: API['clearTable'];
    getSingle: API['getSingle'];
    setSingle: API['setSingle'];
    getQueueItem: API['getQueueItem'];
    getQueueSize: API['getQueueSize'];
    insertQueueItem: API['insertQueueItem'];
};

export type TriggerQueueItem<T> = {
    item: T;
    cb?: (ok: boolean) => void;
};

interface ITriggerQueue<T> {
    add(item: T, cb?: (ok: boolean) => void): void;
    remove(): TriggerQueueItem<T> | undefined; // when remove is called your calling code can pass a callback function to action
    size(): number;
}

export class TriggerQueue<T> implements ITriggerQueue<T> {
    protected list: TriggerQueueItem<T>[] = new Array<TriggerQueueItem<T>>();

    add(item: T, cb?: (ok: boolean) => void): void {
        this.list.push({ item, cb });
    }

    remove(): TriggerQueueItem<T> | undefined {
        return this.list.shift();
    }

    size(): number {
        return this.list.length;
    }
}

function createBoundTable(api: API) {
    return function useTable<T extends Record<string, AllowedPrimitives>>(t: TableName, where: ((v: T) => boolean) | null, notify: TableNotify[] = []): T[] {
        const [v, setV] = useState<T[]>(() => (where ? api.getTable<T>(t).filter(where) : api.getTable<T>(t))); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
        // NOTE: this is required to avoid exhaustive-deps warning, and to avoid calling useEffect everytime v changes
        const hasChanged = useRef((newValues: T[]) => api.tableHasChanged(v, newValues));
        const notifyList = useRef(notify);
        const whereClause = useRef(where);
        hasChanged.current = (newValues: T[]) => api.tableHasChanged(v, newValues);

        useEffect(() => {
            const subscribe = (nv: any[]) => {
                const newValues = nv as T[];
                if (whereClause.current) {
                    // compare to see if changes effect rows this component is hooking into
                    const filtered = newValues.filter(whereClause.current);
                    if (hasChanged.current(filtered)) {
                        setV(newValues.filter(whereClause.current));
                    }
                } else {
                    setV(newValues);
                }
            };

            api.registerTable(t, subscribe, notifyList.current);

            // NOTE: Initialize here because of the delay between useState and useEffect which means
            // changes could have been dispatched before this component was registered to listen for them
            const currentTableValues = whereClause.current ? api.getTable<T>(t).filter(whereClause.current) : api.getTable<T>(t);
            setV(currentTableValues);
            // unregister when component unmounts;
            return () => {
                api.unregisterTable(t, subscribe);
            };
        }, [t]);
        return v;
    };
}

function createBoundTableRow(api: API) {
    return function useTableRow<T extends Record<string, AllowedPrimitives>>(t: TableName, pk: number, notify: RowNotify[] = []): T | undefined {
        const [v, setV] = useState<undefined | T>(() => api.getTableRow<T>(t, pk)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
        // NOTE: this is required to avoid firing useEffect when the notify object reference changes
        const notifyList = useRef(notify);

        useEffect(() => {
            const subscribe = (nv: any) => {
                setV(nv as T);
            };
            api.registerRow(t, pk, subscribe, notifyList.current);
            setV(api.getTableRow<T>(t, pk));
            // unregister when component unmounts;
            return () => {
                api.unregisterRow(t, pk, subscribe);
            };
        }, [t, pk]);
        return v;
    };
}

function createBoundSingle(api: API) {
    return function useSingle<T>(sName: string): T | undefined {
        const [v, setV] = useState<undefined | T>(() => api.getSingle<T>(sName)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
        useEffect(() => {
            const subscribe = (nv: any) => {
                setV(nv as T);
            };
            api.registerSingle(sName, subscribe);
            setV(api.getSingle<T>(sName));
            // unregister when component unmounts;
            return () => {
                api.unregisterSingle(sName, subscribe);
            };
        }, [sName]);
        return v;
    };
}

/** NewTriggerQueue is a wrapper for creating a new trigger queue that will be managed by the store
 *
 * @returns TriggerQueue<T>
 */
export function NewTriggerQueue<T>(): TriggerQueue<T> {
    return new TriggerQueue<T>();
}

export function CreateUtils<T extends Utils>(s: Store): T {
    const x: Utils = {
        tables: {},
        singles: {},
        queues: {},
    };

    for (const tName in s.tables) {
        x.tables[tName] = tName;
    }

    for (const sName in s.singles) {
        x.singles[sName] = sName;
    }

    for (const qName in s.queues) {
        x.queues[qName] = qName;
    }

    return x as T;
}

export default function CreateStore(initialStore: Store) {
    const tableSubscriptions: Record<TableName, Subscribe[]> = {};
    const rowSubscriptions: Record<TableName, Record<PK, Subscribe[]>> = {};
    const singleSubscriptions: Record<SingleName, ((v: any) => void)[]> = {};
    const tableKeys: Record<TableName, PK> = {};
    const tableTriggers: Record<TableName, { [Property in TableTrigger]?: (api: TriggerAPI, v: any) => void }> = {};
    const singleTriggers: Record<SingleName, { [Property in SingleTrigger]?: (api: TriggerAPI, v: any) => void }> = {};
    const queueTriggers: Record<QueueName, { [Property in QueueTrigger]?: (api: TriggerAPI, v: any) => void }> = {};
    // const transactionLog: string[] = [];

    const getArrayProperties = (t: Table): string[] => {
        const arrayProperties: string[] = [];
        for (const k in t) {
            if (t[k] instanceof Array) {
                arrayProperties.push(k);
            }
        }
        return arrayProperties;
    };

    // NOTE: this doesn't create a copy of the original store, it makes changes to it.
    const store = ((state) => {
        for (const tName in state.tables) {
            let i = 0;
            const table = state.tables[tName];
            table._pk = [];
            const arrayProperties = getArrayProperties(table);
            const nonPKProperty = arrayProperties.find((d) => d !== '_pk');
            if (nonPKProperty) {
                for (let len = table[nonPKProperty].length; i < len; i++) {
                    table._pk.push(i + 1); // Autoincrement starts at 1
                }
            }
            tableKeys[tName] = i; // will be 0 if no rows are inserted, but the first row will be designated as 1
        }

        // Attach triggers if user has provided them
        if (state.triggers) {
            // set table triggers
            for (const tName in state.triggers.tables) {
                for (const trigger in state.triggers.tables[tName]) {
                    // If the table is valid and the trigger is valid we add it to our triggers
                    if (tName in state.triggers.tables && (trigger === 'onInsert' || trigger === 'onUpdate' || trigger === 'onDelete')) {
                        // here in case trigger is passed as undefined
                        if (!state.triggers.tables[tName][trigger]) {
                            continue;
                        }
                        if (!tableTriggers[tName]) {
                            tableTriggers[tName] = {};
                        }
                        tableTriggers[tName][trigger] = state.triggers.tables[tName][trigger];
                    }
                }
            }

            // set queue triggers
            for (const qName in state.triggers.queues) {
                for (const trigger in state.triggers.queues[qName]) {
                    // If the table is valid and the trigger is valid we add it to our triggers
                    if (qName in state.triggers.queues && (trigger === 'onInsert' || trigger === 'onGet')) {
                        // here in case trigger is passed as undefined
                        if (!state.triggers.queues[qName][trigger]) {
                            continue;
                        }
                        if (!queueTriggers[qName]) {
                            queueTriggers[qName] = {};
                        }
                        queueTriggers[qName][trigger] = state.triggers.queues[qName][trigger];
                    }
                }
            }

            // set single triggers
            for (const sName in state.triggers.singles) {
                for (const trigger in state.triggers.singles[sName]) {
                    // If the table is valid and the trigger is valid we add it to our triggers
                    if (sName in state.triggers.singles && (trigger === 'onSet' || trigger === 'onGet')) {
                        // here in case trigger is passed as undefined
                        if (!state.triggers.singles[sName][trigger]) {
                            continue;
                        }
                        if (!singleTriggers[sName]) {
                            singleTriggers[sName] = {};
                        }
                        singleTriggers[sName][trigger] = state.triggers.singles[sName][trigger];
                    }
                }
            }
        }
        return state;
    })(initialStore);

    const getTableRowCount = (t: Table): number => {
        for (const k in t) {
            if (t[k] instanceof Array) {
                return t[k].length;
            }
        }
        return 0;
    };

    //   function arrayLengthsMatch(table: Table): boolean {
    //     let l = 0;
    //     const arrayProperties = getArrayProperties(table);
    //     for (let i = 0, len = arrayProperties.length; i < len; i++) {
    //       if (i === 0) {
    //         l = table[arrayProperties[i]].length;
    //         continue;
    //       }
    //       if (table[arrayProperties[i]].length !== l) {
    //         return false;
    //       }
    //     }
    //     return true;
    //   }

    /**
     * Convenience function for returning a table row based on the provided table and index.
     * The function will return undefined if the provided index is out of range (e.g., greater than the number of rows in the table)
     * @param table
     * @param idx
     * @returns TableRow | undefined
     */
    function _getTableRowByIndex(table: Table, idx: number): TableRow | undefined {
        const arrayProperties = getArrayProperties(table);
        if (idx < getTableRowCount(table)) {
            const entry: TableRow = {};
            for (const k of arrayProperties) {
                entry[k] = table[k][idx];
            }
            return entry;
        }
        return undefined;
    }

    function _logError(e: ErrorMessage) {
        console.error(e);
    }

    const registerTable = (tName: TableName, fn: (v: any[]) => void, notify: TableNotify[]) => {
        if (!tableSubscriptions[tName]) {
            tableSubscriptions[tName] = [];
        }
        tableSubscriptions[tName].push({
            notify,
            fn,
        });
    };

    const registerRow = (tName: TableName, pk: PK, fn: (v: any) => void, notify: RowNotify[]) => {
        if (!rowSubscriptions[tName]) {
            rowSubscriptions[tName] = {};
        }

        if (!rowSubscriptions[tName][pk]) {
            rowSubscriptions[tName][pk] = [];
        }

        rowSubscriptions[tName][pk].push({
            notify,
            fn,
        });
    };

    const registerSingle = (sName: SingleName, fn: (v: any) => void) => {
        if (!singleSubscriptions[sName]) {
            singleSubscriptions[sName] = [];
        }
        singleSubscriptions[sName].push(fn);
    };

    const unregisterTable = (tName: TableName, fn: (v: any[]) => void) => {
        if (tableSubscriptions[tName]) {
            tableSubscriptions[tName] = tableSubscriptions[tName].filter((d) => d.fn !== fn);
        }
    };

    const unregisterRow = (tName: TableName, pk: PK, fn: (v: any) => void) => {
        if (rowSubscriptions[tName]?.[pk]) {
            rowSubscriptions[tName][pk] = rowSubscriptions[tName][pk].filter((d) => d.fn !== fn);
            if (rowSubscriptions[tName][pk].length === 0) {
                delete rowSubscriptions[tName][pk]; // remove the property entirely if there are no listeners
            }
        }
    };

    // It seems like it might be here? My unregisters aren't working properly?
    const unregisterSingle = (sName: SingleName, fn: (v: any) => void) => {
        if (singleSubscriptions[sName]) {
            singleSubscriptions[sName] = singleSubscriptions[sName].filter((d) => d !== fn);
        }
    };

    const notifyTableSubscribers = (ne: TableNotify, tName: TableName) => {
        if (tableSubscriptions[tName]?.length > 0) {
            const subscribers: Array<(v: any) => void> = [];
            // Note: there is no point in using a promise here because their bodies are executed immediately (synchronously)
            for (let i = 0, len = tableSubscriptions[tName].length; i < len; i++) {
                const subscriber = tableSubscriptions[tName][i];
                // empty array means they are subscribing to all events
                if (subscriber.notify.length === 0) {
                    subscribers.push(subscriber.fn);
                    continue;
                }
                if (subscriber.notify.includes(ne)) {
                    subscribers.push(subscriber.fn);
                }
            }
            if (subscribers.length > 0) {
                const rows = getTable(tName); // THOUGHTS: One of the downsides is we end-up creating a lot of objects each time the table changes
                for (let i = 0, len = subscribers.length; i < len; i++) {
                    subscribers[i](rows);
                }
            }
        }
    };

    const notifyRowSubscribers = (ne: RowNotify, tName: TableName, pk: PK) => {
        if (rowSubscriptions[tName]?.[pk]?.length > 0) {
            const subscribers: Array<(v: any) => void> = [];
            for (let i = 0, len = rowSubscriptions[tName][pk].length; i < len; i++) {
                const subscriber = rowSubscriptions[tName][pk][i];
                // empty array means they are subscribing to all events
                if (subscriber.notify.length === 0) {
                    subscribers.push(subscriber.fn);
                    continue;
                }
                if (subscriber.notify.includes(ne)) {
                    subscribers.push(subscriber.fn);
                }
            }
            if (subscribers.length > 0) {
                const row = getTableRow(tName, pk);
                for (let i = 0, len = subscribers.length; i < len; i++) {
                    subscribers[i](row);
                }
            }
        }
    };

    const notifySingleSubscribers = <T>(sName: SingleName, value: T) => {
        if (singleSubscriptions[sName]?.length > 0) {
            for (let i = 0, len = singleSubscriptions[sName].length; i < len; i++) {
                singleSubscriptions[sName][i](value);
            }
        }
    };

    // The user provides the type they are expecting to be built
    const getTable = <T extends Record<string, AllowedPrimitives>>(tName: TableName): T[] => {
        const table = store.tables?.[tName];
        if (table) {
            const arrayProperties = getArrayProperties(table);
            if (arrayProperties.length > 0) {
                const entries: Record<string, AllowedPrimitives>[] = [];
                // send back the values as the requested objects
                for (let i = 0, numValues = table[arrayProperties[i]].length; i < numValues; i++) {
                    const entry: Record<string, AllowedPrimitives> = {};
                    for (let j = 0, numArrays = arrayProperties.length; j < numArrays; j++) {
                        entry[arrayProperties[j]] = table[arrayProperties[j]][i];
                    }
                    entries.push(entry);
                }
                return entries as T[];
            }
        }
        _logError({ code: ErrorCode.UnknownTable, message: `Table "${tName}" could not be found` });
        return [];
    };

    const findTableRow = <T extends Record<string, AllowedPrimitives>>(
        tName: TableName,
        where: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] } | ((v: T) => boolean),
    ): T | undefined => {
        const table = store.tables?.[tName];
        if (table) {
            const numRows = getTableRowCount(table);
            if (numRows > 0) {
                const arrayProperties = getArrayProperties(table);
                let idx = -1;
                switch (typeof where) {
                    case 'function': {
                        // loop through the rows until we find a matching index, returns the first match if any
                        const entry: Record<string, AllowedPrimitives> = {};
                        for (let i = 0, len = numRows; i < len; i++) {
                            for (const k of arrayProperties) {
                                entry[k] = table[k][i];
                            }
                            if (where(entry as T)) {
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
                                if (!arrayProperties.includes(k)) {
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
                    const entry = _getTableRowByIndex(table, idx);
                    if (entry) {
                        return entry as T;
                    }
                    return undefined;
                }
            }
        }
        _logError({ code: ErrorCode.UnknownTable, message: `Table "${tName}" could not be found` });
        return undefined;
    };

    const findTableRows = <T extends Record<string, AllowedPrimitives>>(
        tName: TableName,
        where: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] } | ((v: T) => boolean),
    ): T[] => {
        const table = store.tables?.[tName];
        if (table) {
            const numRows = getTableRowCount(table);
            if (numRows > 0) {
                const arrayProperties = getArrayProperties(table);
                if (typeof where === 'function') {
                    const entries: Record<string, AllowedPrimitives>[] = [];
                    // loop through the rows until we find a matching index, returns the first match if any
                    for (let i = 0, len = numRows; i < len; i++) {
                        const entry = _getTableRowByIndex(table, i);
                        if (entry && where(entry as T)) {
                            entries.push(entry);
                        }
                    }
                    return entries as T[];
                }

                if (typeof where == 'object') {
                    const keys = Object.keys(where);
                    if (keys.length === 0) {
                        return [];
                    } else {
                        // make sure the requested columns exist in the table; if they don't all exist, return undefined
                        for (const k of keys) {
                            if (!arrayProperties.includes(k)) {
                                return [];
                            }
                        }
                        const entries: Record<string, AllowedPrimitives>[] = [];
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
                                const entry = _getTableRowByIndex(table, i);
                                if (entry) {
                                    entries.push(entry);
                                }
                            }
                        }
                        return entries as T[];
                    }
                }
            }
        }
        _logError({ code: ErrorCode.UnknownTable, message: `Table "${tName}" could not be found` });
        return [];
    };

    // The user provides the type they are expecting to be built
    const getTableRow = <T extends Record<string, AllowedPrimitives>>(tName: TableName, pk: PK): T | undefined => {
        const table = store.tables?.[tName];
        if (table) {
            const numRows = getTableRowCount(table);
            if (numRows > 0) {
                const arrayProperties = getArrayProperties(table);
                let idx = -1;
                for (let i = 0, len = table._pk.length; i < len; i++) {
                    if (table._pk[i] === pk) {
                        idx = i;
                        break;
                    }
                }
                if (idx >= 0) {
                    // build the appropriate entry
                    const entry: Record<string, AllowedPrimitives> = {};
                    for (const k of arrayProperties) {
                        entry[k] = table[k][idx];
                    }
                    return entry as T;
                }
            }
        }
        _logError({ code: ErrorCode.UnknownTable, message: `Table "${tName}" could not be found` });
        return undefined;
    };

    // internal function that the externally exposed insertTableRow() and insertTableRows() functions  call for adding entries to a table
    const _insertTableRow = <T extends Record<string, AllowedPrimitives>>(
        tName: TableName,
        table: Table,
        tableProps: string[],
        valueMap: { [Property in keyof T as Exclude<Property, '_pk'>]: T[Property] },
    ): T => {
        const insertTrigger = tableTriggers[tName]?.['onInsert'];
        const entry: Record<string, AllowedPrimitives> = {};
        for (let i = 0, len = tableProps.length; i < len; i++) {
            // Autoincrement on insert
            if (tableProps[i] === '_pk') {
                table._pk.push(++tableKeys[tName]);
                entry['_pk'] = tableKeys[tName];
                continue;
            }
            table[tableProps[i]].push(valueMap[tableProps[i]]);
            entry[tableProps[i]] = valueMap[tableProps[i]];
        }
        if (insertTrigger) {
            insertTrigger(api, entry);
        }
        return entry as T;
    };

    // insertTableRow is used for adding an individual row. Any notifications are fired immediately.
    const insertTableRow = <T extends Record<string, AllowedPrimitives>>(
        tName: TableName,
        valueMap: { [Property in keyof T as Exclude<Property, '_pk'>]: T[Property] },
    ): T | undefined => {
        if (!(valueMap instanceof Object)) {
            console.log(`Error: entry is not an object or an Array of objects. Received ${typeof valueMap}`);
            return undefined;
        }
        const table = store.tables?.[tName];
        if (table) {
            const arrayProperties = getArrayProperties(table);
            // confirm valueMap has all properties
            for (let i = 0, len = arrayProperties.length; i < len; i++) {
                if (!(arrayProperties[i] in valueMap) && arrayProperties[i] !== '_pk') {
                    return undefined;
                }
            }
            const entry = _insertTableRow<T>(tName, table, arrayProperties, valueMap);
            notifyTableSubscribers('rowInsert', tName);
            return entry as T;
        }
        _logError({ code: ErrorCode.UnknownTable, message: `Table "${tName}" could not be found` });
        return undefined;
    };

    /**
     * Used for adding multiple rows in a single call. The notification is fired after all rows have been added; however,
     * if a trigger is attached, then notifications could occur more frequently because of the trigger. The inserted rows are
     * returned as an array, which can be important if triggers purposefully manipulate the values.
     *
     * On error, no values are inserted and an empty array is returned
     * @param tName Name of the table for inserting the rows
     * @param valueMap The key:value pairings for each row
     * @returns
     */
    const insertTableRows = <T extends Record<string, AllowedPrimitives>>(
        tName: TableName,
        valueMap: Array<{ [Property in keyof T as Exclude<Property, '_pk'>]: T[Property] }>,
    ): T[] => {
        if (!(valueMap instanceof Array)) {
            console.log(`Error: entry is not an Array of objects. Received ${typeof valueMap}`);
            return [];
        }
        if (valueMap.length === 0) {
            return [];
        }
        const table = store.tables?.[tName];
        if (table) {
            const arrayProperties = getArrayProperties(table);
            // check that all values are correct before continuing
            for (let i = 0, vLen = valueMap.length; i < vLen; i++) {
                const row = valueMap[i];
                if (!(row instanceof Object)) {
                    console.log(`Error: row is not an object. Received ${typeof valueMap[i]}`);
                    return [];
                }
                // confirm valueMap has all properties
                for (let j = 0, propLen = arrayProperties.length; j < propLen; j++) {
                    if (!(arrayProperties[j] in valueMap[i]) && arrayProperties[j] !== '_pk') {
                        console.log(`Error: missing property ${arrayProperties[j]} for table ${tName}`);
                        return [];
                    }
                }
            }
            const entries: T[] = [];
            for (let i = 0, len = valueMap.length; i < len; i++) {
                entries.push(_insertTableRow<T>(tName, table, arrayProperties, valueMap[i]));
            }
            notifyTableSubscribers('rowInsert', tName);
            return entries;
        }
        _logError({ code: ErrorCode.UnknownTable, message: `Table "${tName}" could not be found` });
        return [];
    };

    const updateTableRow = <T extends Record<string, AllowedPrimitives>>(
        tName: TableName,
        pk: PK,
        valueMap: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] },
    ): boolean => {
        const table = store.tables?.[tName];
        if (table) {
            const arrayProperties = getArrayProperties(table);
            for (const k in valueMap) {
                if (!arrayProperties.includes(k)) {
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
                for (const k in valueMap) {
                    if (k !== '_pk') {
                        const v = valueMap[k];
                        if (v !== undefined) {
                            table[k][idx] = v;
                        }
                    }
                }
                notifyRowSubscribers('rowUpdate', tName, pk);
                notifyTableSubscribers('rowUpdate', tName);
                return true;
            }
        }
        _logError({ code: ErrorCode.UnknownTable, message: `Table "${tName}" could not be found` });
        return false;
    };

    const setSingle = <T>(sName: SingleName, value: T): boolean => {
        if (store.singles?.[sName] !== undefined) {
            if (store.singles[sName] !== value) {
                store.singles[sName] = value;
                notifySingleSubscribers<T>(sName, value); // we pass the value to save extra function calls within notifySingleSubscribers
                const setTrigger = singleTriggers[sName]?.['onSet'];
                if (setTrigger) {
                    setTrigger(api, value);
                }
            }
            return true;
        }
        _logError({ code: ErrorCode.UnknownSingle, message: `Single "${sName}" could not be found` });
        return false;
    };

    const getSingle = <T>(sName: SingleName): T | undefined => {
        if (store.singles?.[sName] !== undefined) {
            const value = store.singles[sName];
            const getTrigger = singleTriggers[sName]?.['onGet'];
            if (getTrigger) {
                getTrigger(api, value);
            }
            return value as T;
        }
        _logError({ code: ErrorCode.UnknownSingle, message: `Single "${sName}" could not be found` });
        return undefined;
    };

    const deleteTableRow = (tName: TableName, pk: PK): boolean => {
        const table = store.tables?.[tName];
        if (table) {
            let idx = -1;
            // find the idx where the pk exists in this table
            for (let i = 0, len = table._pk.length; i < len; i++) {
                if (table._pk[i] === pk) {
                    idx = i;
                }
            }
            if (idx >= 0) {
                const arrayProperties = getArrayProperties(table);
                for (const k of arrayProperties) {
                    table[k].splice(idx, 1);
                }
                notifyRowSubscribers('rowDelete', tName, pk);
                notifyTableSubscribers('rowDelete', tName);
                return true;
            }
        }
        _logError({ code: ErrorCode.UnknownTable, message: `Table "${tName}" could not be found` });
        return false;
    };

    const clearTable = (tName: TableName): boolean => {
        const table = store.tables?.[tName];
        if (table) {
            const pkeys: PK[] = [];
            for (let i = 0, len = table._pk.length; i < len; i++) {
                pkeys.push(table._pk[i]);
            }
            for (let i = 0, len = pkeys.length; i < len; i++) {
                deleteTableRow(tName, pkeys[i]); // this is expensive
            }
            tableKeys[tName] = 0; // reset the primary key
            return true;
        }
        _logError({ code: ErrorCode.UnknownTable, message: `Table "${tName}" could not be found` });
        return false;
    };

    const tableHasChanged = <T>(oldValues: T[], newValues: T[]): boolean => {
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

    function insertQueueItem<T>(qName: string, item: T, cb?: (ok: boolean) => void): boolean {
        const q = store.queues?.[qName];
        if (q) {
            const insertTrigger = queueTriggers[qName]?.['onInsert'];
            q.add(item, cb);
            if (insertTrigger) {
                insertTrigger(api, item);
            }
            return true;
        }
        _logError({ code: ErrorCode.UnknownQueue, message: `Queue "${qName}" could not be found` });
        return false;
    }

    function getQueueItem<T>(qName: string): TriggerQueueItem<T> | undefined {
        const q = store.queues?.[qName];
        if (q) {
            const item = q.remove();
            if (item) {
                const getTrigger = queueTriggers[qName]?.['onGet'];
                if (getTrigger) {
                    getTrigger(api, item);
                }
                return item as TriggerQueueItem<T>;
            }
            return undefined;
        }
        _logError({ code: ErrorCode.UnknownQueue, message: `Queue "${qName}" could not be found` });
        return undefined;
    }

    function getQueueSize(qName: string): number {
        const q = store.queues?.[qName];
        if (q) {
            return q.size();
        }
        _logError({ code: ErrorCode.UnknownQueue, message: `Queue "${qName}" could not be found` });
        return -1; // return -1 if queue does not exist
    }

    const api: API = {
        getTable,
        getTableRow,
        findTableRow,
        findTableRows,
        insertTableRow,
        insertTableRows,
        updateTableRow,
        deleteTableRow,
        registerTable,
        registerRow,
        registerSingle,
        unregisterTable,
        unregisterRow,
        unregisterSingle,
        clearTable,
        getSingle,
        setSingle,
        tableHasChanged,
        getQueueItem,
        getQueueSize,
        insertQueueItem,
    };

    // Bind the API to the hooks
    const useTable = createBoundTable(api);
    const useTableRow = createBoundTableRow(api);
    const useSingle = createBoundSingle(api);

    return {
        useTable,
        useTableRow,
        useSingle,
        insertTableRow,
        insertTableRows,
        updateTableRow,
        deleteTableRow,
        setSingle,
        findTableRow,
        findTableRows,
        clearTable,
        getSingle,
        getTable,
        getTableRow,
        getQueueItem,
        getQueueSize,
        insertQueueItem,
    };
}
