import { useState, useRef, useEffect } from 'react';

// type StoreEntry = Store["models"][number]; how we can get the type of an element in an array
type TableName = Extract<keyof Store["tables"], string>; // here to prevent TypeScript from using string | number as index
type SingleName = Extract<keyof Store["singles"], string>; // here to prevent TypeScript from using string | number as index
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
type Trigger = 'onDelete' | 'onUpdate' | 'onInsert';

type Subscribe = {
    notify: Notify[];
    fn(v: any): void;
};

export type AllowedPrimitives = string | number | boolean | null;

export type Table = {[index: string]: Array<AllowedPrimitives>} & {
    /** The numbers you enter are quite in-con-sequential (Dr. Evil); the engine will assign them for you */
    _pk: Array<PK>;
}; // tables hold arrays, or trigger functions

export interface Store {
    tables: {[index: string]: Table};
    triggers?: Record<TableName, {[Property in Trigger]?: (api: TriggerAPI, v: any) => void}>; // TODO: someway to prevent infinite triggers (e.g., inserts/updates that keep calling themselves)
    singles: {[index: string]: any};

    error: string;
}

type API = {
    registerTable(tName: TableName, fn: (v: any[]) => void, notify: Notify[]): void;
    registerRow(tName: TableName, pk: PK, fn: (v: any) => void, notify: Notify[]): void;
    registerSingle(sName: SingleName, fn: (v: any) => void): void;
    unregisterRow(tName: TableName, pk: PK, fn: (v: any) => void): void;
    unregisterTable(tName: TableName, fn: (v: any[]) => void): void;
    unregisterSingle(sName: SingleName, fn: (v: any) => void): void;
    getTable<T extends Record<string, AllowedPrimitives>>(t: TableName): T[];
    getTableRow<T extends Record<string, AllowedPrimitives>>(t: TableName, pk: PK): T | null;
    findTableRow<T extends Record<string, AllowedPrimitives>>(t: TableName, where: {[Property in keyof T as Exclude<Property, "_pk">]?: T[Property]}): T | null;
    setError(e: string): void;
    insertTableRow<T extends Record<string, AllowedPrimitives>,>(tName: TableName, valueMap: {[Property in keyof T as Exclude<Property, "_pk">]: T[Property]}): T | null;
    insertTableRows<T extends Record<string, AllowedPrimitives>,>(tName: TableName, valueMap: Array<{[Property in keyof T as Exclude<Property, "_pk">]: T[Property]}>): T[];
    updateTableRow<T extends Record<string, AllowedPrimitives>>(tName: TableName, pk: PK, valueMap: {[Property in keyof T as Exclude<Property, "_pk">]?: T[Property]} ): boolean;
    deleteTableRow(tName: TableName, pk: PK): boolean;
    clearTable(tName: TableName): boolean;
    getSingle<T,>(sName: SingleName): T | null;
    tableHasChanged<T,>(oldValues: T[], newValues: T[]): boolean;
}

export type TriggerAPI = {
    getTable: API["getTable"];
    getTableRow: API["getTableRow"];
    findTableRow: API["findTableRow"];
    insertTableRow: API["insertTableRow"];
    updateTableRow: API["updateTableRow"];
    deleteTableRow: API["deleteTableRow"];
    clearTable: API["clearTable"];
    getSingle: API["getSingle"];
}

function createBoundTable(api: API) {
    return function useTable<T extends Record<string, AllowedPrimitives>>(t: TableName, where: ((v: T) => boolean) | null, notify: TableNotify[] = [] ): T[] {
        const [v, setV] = useState<T[]>(() => where ? api.getTable<T>(t).filter(where) : api.getTable<T>(t)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
        // NOTE: this is required to avoid exhaustive-deps warning, and to avoid calling useEffect everytime v changes
        const hasChanged = useRef((newValues: T[]) => api.tableHasChanged(v, newValues));
        const notifyList = useRef(notify);
        const whereClause = useRef(where);
        hasChanged.current = (newValues: T[]) => api.tableHasChanged(v, newValues);

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
            
            api.registerTable(t, subscribe, notifyList.current);

            // NOTE: Initialize here because of the delay between useState and useEffect which means
            // changes could have been dispatched before this component was registered to listen for them
            const currentTableValues = whereClause.current ? api.getTable<T>(t).filter(whereClause.current) : api.getTable<T>(t);
            setV(currentTableValues);
            // unregister when component unmounts;
            return () => {
                api.unregisterTable(t, subscribe);
            }
        }, [t]);
        return v;
    }
}

function createBoundTableRow(api: API) {
    return function useTableRow<T extends Record<string, AllowedPrimitives>>(t: TableName, pk: number, notify: RowNotify[] = []): T | null {
        const [v, setV] = useState<null | T>(() => api.getTableRow<T>(t, pk)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
        // NOTE: this is required to avoid firing useEffect when the notify object reference changes
        const notifyList = useRef(notify);
        
        useEffect(() => {
            const subscribe = (v: T) => {
                setV(v);
            };
            api.registerRow(t, pk, subscribe, notifyList.current);
            setV(api.getTableRow<T>(t, pk))
            // unregister when component unmounts;
            return () => {
                api.unregisterRow(t, pk, subscribe);
            }
        }, [t, pk]);
        return v;
    }
}

function createBoundSingle(api: API) {
    return function useSingle<T>(sName: string): T | null {
        const [v, setV] = useState<null | T>(() => api.getSingle<T>(sName)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
        useEffect(() => {
            const subscribe = (v: T) => {
                setV(v);
            };
            api.registerSingle(sName, subscribe);
            setV(api.getSingle<T>(sName));
            // unregister when component unmounts;
            return () => {
                api.unregisterSingle(sName, subscribe);
            }
        }, [sName]);
        return v;
    }
}

export default function CreateStore(initialState: Store) {

    const tableSubscriptions: Record<TableName, Subscribe[]> = {};
    const rowSubscriptions: Record<TableName, Record<PK, Subscribe[]>> = {};
    const singleSubscriptions: Record<SingleName, ((v: any) => void)[]> = {};
    const tableKeys: Record<TableName, PK> = {};
    const tableTriggers: Record<TableName, {[Property in Trigger]?: ((api: TriggerAPI, v: any) => void)}> = {};
    const transactionLog: string[] = [];

    const getArrayProperties = (t: Table): string[] => {
        const arrayProperties: string[] = [];
        for (const k in t) {
            if (t[k] instanceof Array) {
                arrayProperties.push(k);
            }
        }
        return arrayProperties;
    };

    // setup the primary keys
    // NOTE: this doesn't create a copy of the original store, it makes changes to it.
    const store = ((initialState) => {
        for (const tName in initialState.tables) {
            let i = 0;
            const table = initialState.tables[tName];
            table._pk = [];
            const arrayProperties = getArrayProperties(table)
            const nonPKProperty = arrayProperties.find(d => d !== "_pk");
            if (nonPKProperty) {
                for (let len = table[nonPKProperty].length; i < len; i++) {
                    table._pk.push(i + 1); // Autoincrement starts at 1 
                }
            }
            tableKeys[tName] = i; // will be 0 if no rows are inserted, but the first row will be designated as 1
        }
        
        // Attach triggers if user has provided them
        for (const tName in initialState.triggers) {
            for (const trigger in initialState.triggers[tName]) {
                // If the table is valid and the trigger is valid we add it to our triggers
                if (tName in initialState.tables && (trigger === 'onInsert' || trigger === 'onUpdate' || trigger === 'onDelete')) {
                    // here in case trigger is passed as undefined
                    if (!initialState.triggers[tName][trigger]) {
                        continue;
                    }
                    if (!tableTriggers[tName]) {
                        tableTriggers[tName] = {};
                    }
                    tableTriggers[tName][trigger] = initialState.triggers[tName][trigger];
                }
            }
        }
        return initialState;
    })(initialState);
    
    const getTableRowCount = (t: Table): number => {
        for (const k in t) {
            if (t[k] instanceof Array) {
                return t[k].length;
            }
        }
        return 0;
    };

    function arrayLengthsMatch(table: Table): boolean {
        let l = 0;
        const arrayProperties = getArrayProperties(table);
        for (let i = 0, len = arrayProperties.length; i < len; i++) {
            if (i === 0) {
                l = table[arrayProperties[i]].length;
                continue;
            }
            if (table[arrayProperties[i]].length !== l) {
                return false;
            }
        }
        return true;
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
            tableSubscriptions[tName] = tableSubscriptions[tName].filter(d => d.fn !== fn);
        }
    };

    const unregisterRow = (tName:  TableName, pk: PK, fn: (v: any) => void) => {
        if (rowSubscriptions[tName]?.[pk]) {
            rowSubscriptions[tName][pk] = rowSubscriptions[tName][pk].filter(d => d.fn !== fn);
            if (rowSubscriptions[tName][pk].length === 0) {
                delete rowSubscriptions[tName][pk]; // remove the property entirely if there are no listeners
            }
        }
    };

    // It seems like it might be here? My unregisters aren't working properly?
    const unregisterSingle = (sName: SingleName, fn: (v: any) => void) => {
        if (singleSubscriptions[sName]) {
            singleSubscriptions[sName] = singleSubscriptions[sName].filter(d => d !== fn);
        }
    }

    const notifyTableSubscribers = (ne: TableNotify, tName: TableName) => {
        if (tableSubscriptions[tName]?.length > 0) {
            const subscribers: Array<(v: any) => void> = [];
            // Note: there is no point in using a promise here because their bodies are executed immediately (synchronously)
            for (let i = 0, len = tableSubscriptions[tName].length; i < len; i++) {
                let subscriber = tableSubscriptions[tName][i];
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
                let subscriber = rowSubscriptions[tName][pk][i];
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

    const notifySingleSubscribers = <T,>(sName: SingleName, value: T) => {
        if (singleSubscriptions[sName]?.length > 0) {
            for (let i = 0, len = singleSubscriptions[sName].length; i < len; i++) {
                singleSubscriptions[sName][i](value);
            }
        }
    };

    const setError = (e: string) => {
        store.error = e;
    };

    // The user provides the type they are expecting to be built
    const getTable = <T extends Record<string, AllowedPrimitives>,>(tName: TableName): T[] => {
        const table = store.tables[tName];
        if (table) {
            let arrayProperties = getArrayProperties(table);
            if (arrayProperties.length > 0) {
                const entries: Record<string, AllowedPrimitives>[] = [];
                // send back the values as the requested objects
                for (let i = 0, numValues = table[arrayProperties[i]].length; i < numValues; i++) {
                    let entry: Record<string, AllowedPrimitives> = {}
                    for (let j = 0, numArrays = arrayProperties.length; j < numArrays; j++) {
                        entry[arrayProperties[j]] = table[arrayProperties[j]][i];
                    }
                    entries.push(entry);
                }
                return entries as T[];
            }
        }
        return [];
    };

    const findTableRow = <T extends Record<string, AllowedPrimitives>,>(tName: TableName, where: {[Property in keyof T as Exclude<Property, "_pk">]?: T[Property]}): T | null => {
        const table = store.tables[tName];
        if (table) {
            const numRows = getTableRowCount(table);
            if (numRows > 0 ) {
                const arrayProperties = getArrayProperties(table);
                let idx = -1;
                const keys = Object.keys(where);
                if (keys.length === 0) {
                    return null;
                } else {
                    // make sure the requested columns exist in the table; if they don't all exist, return null
                    for (const k of keys) {
                        if (!arrayProperties.includes(k)) {
                            return null;
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
                    if (idx >= 0) {
                        // build the appropriate entry
                        // ISSUE #18
                        let entry: Record<string, AllowedPrimitives> = {}
                        for (const k of arrayProperties) {
                            entry[k] = table[k][idx];
                        }
                        return entry as T;
                    }
                }
            }
        }
        return null
    }

    // The user provides the type they are expecting to be built
    const getTableRow = <T extends Record<string, AllowedPrimitives>,>(t: TableName, pk: PK): T | null => {
        const table = store.tables[t];
        if (table) {
            const numRows = getTableRowCount(table);
            if (numRows > 0 ) {
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
                    let entry: Record<string, AllowedPrimitives> = {}
                    for (const k of arrayProperties) {
                        entry[k] = table[k][idx];
                    }
                    return entry as T;
                }
            }
        }
        return null;
    };

    // internal function that the externally exposed insertTableRow() and insertTableRows() functions  call for adding entries to a table
    const _insertTableRow  = <T extends Record<string, AllowedPrimitives>,>(tName: TableName, table: Table, tableProps: string[], valueMap: {[Property in keyof T as Exclude<Property, "_pk">]: T[Property]}): T => {
        const insertTrigger = tableTriggers[tName]?.['onInsert']
        const entry: Record<string, AllowedPrimitives> = {}
        for (let i = 0, len = tableProps.length; i < len; i++) {
            // Autoincrement on insert
            if (tableProps[i] === '_pk') {
                table._pk.push(++tableKeys[tName]);
                entry["_pk"] = tableKeys[tName];
                continue;
            }
            table[tableProps[i]].push(valueMap[tableProps[i]]);
            entry[tableProps[i]] = valueMap[tableProps[i]];
        }
        if (insertTrigger) {
            insertTrigger(api, entry);
        }
        return entry as T;
    }

    // insertTableRow is used for adding an individual row. Any notifications are fired immediately.
    const insertTableRow = <T extends Record<string, AllowedPrimitives>,>(tName: TableName, valueMap: {[Property in keyof T as Exclude<Property, "_pk">]: T[Property]}): T | null => {
        if (!(valueMap instanceof Object)) {
            console.log(`Error: entry is not an object or an Array of objects. Received ${typeof valueMap}`);
            return null;
        }
        const table = store.tables[tName];
        if (table) {
            let arrayProperties = getArrayProperties(table);
            // confirm valueMap has all properties
            for (let i = 0, len = arrayProperties.length; i < len; i++) {
                if (!(arrayProperties[i] in valueMap) && arrayProperties[i] !== '_pk') {
                    return null;
                }
            }
            const entry = _insertTableRow<T>(tName, table, arrayProperties, valueMap);
            notifyTableSubscribers('rowInsert', tName);
            return entry as T;
        }
        return null;
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
    const insertTableRows = <T extends Record<string, AllowedPrimitives>,>(tName: TableName, valueMap: Array<{[Property in keyof T as Exclude<Property, "_pk">]: T[Property]}>): T[] => {
        if (!(valueMap instanceof Array)) {
            console.log(`Error: entry is not an Array of objects. Received ${typeof valueMap}`);
            return [];
        }
        if (valueMap.length === 0) {
            return [];
        }
        const table = store.tables[tName];
        if (table) {
            let arrayProperties = getArrayProperties(table);
            // check that all values are correct before continuing
            for (let i = 0, len = valueMap.length; i < len; i++) {
                const row = valueMap[i];
                if (!(row instanceof Object)) {
                    console.log(`Error: row is not an object. Received ${typeof valueMap[i]}`);
                    return [];
                }
                // confirm valueMap has all properties
                for (let j = 0, len = arrayProperties.length; j < len; j++) {
                    if (!(arrayProperties[j] in valueMap[i]) && arrayProperties[j] !== '_pk') {
                        console.log(`Error: missing property ${arrayProperties[j]} for table ${tName}`);
                        return [];
                    }
                }
            }
            const entries: T[] = [];
            for (let i = 0, len = valueMap.length; i < len; i++) {
                entries.push(_insertTableRow<T>(tName, table, arrayProperties, valueMap[i]))
            }
            notifyTableSubscribers('rowInsert', tName);
            return entries;
        }
        return [];
    };
    
    const updateTableRow = <T extends Record<string, AllowedPrimitives>>(tName: TableName, pk: PK, valueMap: {[Property in keyof T as Exclude<Property, "_pk">]?: T[Property]} ): boolean => {
        const table = store.tables[tName];
        if (table) {
            let arrayProperties = getArrayProperties(store.tables[tName]);
            for (const k in valueMap) {
                if (!arrayProperties.includes(k)) {
                    return false;
                }
            }
            let idx = -1;
            // find the idx where the pk exists in this table
            for (let i = 0, len = table._pk.length; i < len; i++ ) {
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
        return false;
    };

    const setSingle = <T,>(sName: SingleName, value: T): boolean => {
        if (store.singles[sName] !== value) {
            store.singles[sName] = value;
            notifySingleSubscribers<T>(sName, value); // we pass the value to save extra function calls within notifySingleSubscribers
        }
        return true;
    };

    const getSingle = <T,>(sName: SingleName): T | null => {
        return store.singles[sName] ?? null;
    }

    const deleteTableRow = (tName: TableName, pk: PK): boolean => {
        const table = store.tables[tName];
        if (table) {
            let idx = -1;
            // find the idx where the pk exists in this table
            for (let i = 0, len = table._pk.length; i < len; i++ ) {
                if (table._pk[i] === pk) {
                    idx = i;
                }
            }
            if (idx >= 0) {
                let arrayProperties = getArrayProperties(store.tables[tName]);
                for (const k of arrayProperties) {
                    table[k].splice(idx, 1);
                }
                notifyRowSubscribers('rowDelete', tName, pk);
                notifyTableSubscribers('rowDelete', tName);
                return true;
            }
        }
        return false;
    };

    const clearTable = (tName: TableName): boolean => {
        const table = store.tables[tName];
        if (table) {
            const pkeys: PK[] = [];
            for (let i = 0, len = table._pk.length; i < len; i++) {
                pkeys.push(table._pk[i]);
            }
            for (let i = 0, len = pkeys.length; i < len; i++) {
                deleteTableRow(tName, pkeys[i]);
            }
            tableKeys[tName] = 0; // reset the primary key
        }
        return false;
    };

    const tableHasChanged = <T,>(oldValues: T[], newValues: T[]): boolean => {
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

    const api: API = {
        getTable,
        getTableRow,
        findTableRow,
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
        setError,
        clearTable,
        getSingle,
        tableHasChanged,
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
        clearTable,
        getSingle,
        getTable,
        getTableRow,
    }
};
