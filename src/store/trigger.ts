import { useState, useRef, useEffect } from 'react';

// type StoreEntry = Store["models"][number]; how we can get the type of an element in an array
type TableName = Extract<keyof Store["tables"], string>; // here to prevent TypeScript from using string | number as index
/** Autoincrementing primary key required for tables */
type PK = number;

type TableNotify = 'tableInsert' | 'tableDelete' | 'tableUpdate';
type TableRowNotify = 'rowUpdate' | 'rowDelete';
/** Notify is a union of the available notification events that can be subscribed to
 * - tableInsert
 * - tableDelete
 * - tableupdate
 * - rowUpdate
 * - rowDelete
*/
type Notify = TableNotify | TableRowNotify;
type Subscribe = {
    notify: Notify[];
    fn(v: any): void;
};

// THOUGHTS: could consider making the backing arrays strongly  typed (e.g., Uint16Array for strings, Float64 for numbers), this would let me test their type as well
export type AllowedPrimitives = string | number | boolean | null;

// Note: triggers should happen BEFORE the change; notifications should happen AFTER the change
export type Table = {[index: string]: Array<AllowedPrimitives>} & {
    /** The numbers you enter are quite in-con-sequential (Dr. Evil); the engine will assign them for you */
    _pk: Array<PK>;
    onDelete?: (() => void);
    onInsert?: (() => void);
    onUpdate?: (() => void);
}; // tables hold arrays, or trigger functions

export type Store = {
    tables: {[index: string]: Table};
    singles: {[index: string]: any};
    error: string;
}

type API = {
    registerTable(tName: TableName, fn: (v: any) => void, notify: Notify[]): void;
    registerRow(tName: TableName, pk: PK, fn: (v: any) => void, notify: Notify[]): void;
    unregisterRow(tName: TableName, pk: PK, fn: (v: any) => void): void;
    unregisterTable(tName: TableName, fn: (v: any) => void): void;
    getTable<T extends Record<string, AllowedPrimitives>>(t: TableName): T[];
    getTableRow<T extends Record<string, AllowedPrimitives>>(t: TableName, pk: PK): T | null;
    findRow<T extends Record<string, AllowedPrimitives>>(t: TableName, where: Record<string, AllowedPrimitives>): T | null;
    setError(e: string): void;
    insertTableRow<T extends Record<string, AllowedPrimitives>,>(tName: TableName, valueMap: T): boolean;
    updateTableRow<T extends Record<string, AllowedPrimitives>>(tName: TableName, pk: PK, valueMap: {[Property in keyof T as Exclude<Property, "_pk">]?: T[Property]} ): boolean;
    deleteTableRow(tName: TableName, pk: PK): boolean;
}

function useTable<T extends Record<string, AllowedPrimitives>>(api: API, t: TableName, notify: TableNotify[] = [] ) {
    const [v, setV] = useState<T[]>(() => {
        return api.getTable<T>(t);
    });
    const registered = useRef<null | ((v: T[]) => void)>(null);

    useEffect(() => {
        // unregister when component unmounts;
        return () => {
            if (registered.current) {
                api.unregisterTable(t, registered.current);
            }
        }
    }, [api, t]);

    if (registered.current === null) {
        const subscribe = (v: T[]) => {
            setV(v);
        };
        registered.current = subscribe;
        api.registerTable(t, subscribe, notify);
    }
    return v;
}

// this is the value that updated, were any subscribers interested in it?
function useTableRow<T extends Record<string, AllowedPrimitives>>(api: API, t: TableName, pk: number, notify: TableRowNotify[] = []) {
    const [v, setV] = useState<null | T>(() => {
        return api.getTableRow<T>(t, pk);
    });

    const registered = useRef<null | ((v: T) => void)>(null);

    useEffect(() => {
        // unregister when component unmounts;
        return () => {
            if (registered.current) {
                api.unregisterRow(t, pk, registered.current);
            }
        }
    }, [api, t, pk]);

    if (registered.current === null) {
        const subscribe = (v: T) => {
            setV(v);
        };
        registered.current = subscribe;
        api.registerRow(t, pk, subscribe, notify); 
    }
    return v;
}

// THOUGHTS: when creating the store, the user could pass a properties object with instructions like enforcing unique column values
// THOUGHTS: we haven't guarded against providing the wrong primitive type for the column
export default function CreateStore(initialState: Store) {

    const tableSubscriptions: Record<TableName, Subscribe[]> = {};
    const rowSubscriptions: Record<TableName, Record<PK, Subscribe[]>> = {};
    const tableKeys: Record<TableName, PK> = {};
    const ledger: string[] = [];

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
        let l = 1;
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

    const registerTable = (tName: TableName, fn: (v: any) => void, notify: TableNotify[]) => {
        if (!tableSubscriptions[tName]) {
            tableSubscriptions[tName] = [];
        }
        tableSubscriptions[tName].push({
            notify,
            fn,
        });
    };

    const registerRow = (tName: TableName, pk: PK, fn: (v: any) => void, notify: TableRowNotify[]) => {
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
    }

    const unregisterTable = (tName: TableName, fn: (v: any) => void) => {
        if (tableSubscriptions[tName]) {
            tableSubscriptions[tName] = tableSubscriptions[tName].filter(d => d.fn !== fn);
        }
    };

    const unregisterRow = (tName:  TableName, pk: PK, fn: (v: any) => void) => {
        if (rowSubscriptions?.[tName]?.[pk]) {
            rowSubscriptions[tName][pk] = rowSubscriptions[tName][pk].filter(d => d.fn !== fn);
            if (rowSubscriptions[tName][pk].length === 0) {
                delete rowSubscriptions[tName][pk]; // remove the property entirely if there are no listeners
            }
        }
    };

    const notifyTableSubscribers = (ne: TableNotify, tName: TableName) => {
        if (tableSubscriptions?.[tName].length > 0) {
            new Promise(() => {
                const subscribers: Array<(v: any) => void> = [];
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
                    const rows = getTable(tName);
                    for (let i = 0, len = subscribers.length; i < len; i++) {
                        subscribers[i](rows);
                    }
                }
            });
        }
    };

    const notifyRowSubscribers = (ne: TableRowNotify, tName: TableName, pk: PK) => {
        if (rowSubscriptions?.[tName]?.[pk].length > 0) {
            new Promise(() => {
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
            });
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
                // THOUGHTS: how we can use SELECT logic to return certain columns
                // if  (reqFields.length > 0) {
                //     arrayProperties = arrayProperties.filter(d => reqFields.includes(d as Extract<keyof T, string>));
                // }
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

    const findRow = <T extends Record<string, AllowedPrimitives>,>(tName: TableName, where: Record<string, AllowedPrimitives>): T | null => {
        const table = store.tables[tName];
        if (table) {
            const numRows = getTableRowCount(table);
            if (numRows > 0 ) {
                const arrayProperties = getArrayProperties(table);
                let idx = -1;
                const keys = Object.keys(where);
                if (keys.length > 0) {
                    return null;
                } else {
                    // make sure the requested columns exist in the table; if they don't all exist, return null
                    for (const k in keys) {
                        if (!arrayProperties.includes(k)) {
                            return null;
                        }
                    }
                    // loop through the rows until we find a matching index, returns the first match if any
                    for (let i = 0, len = numRows; i < len; i++) {
                        let allMatch = true;
                        for (const k in keys) {
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
                        let entry: Record<string, AllowedPrimitives> = {}
                        for (const k in keys) {
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

    // TODO: onDelete row should remove any listeners
    const insertTableRow = <T extends Record<string, AllowedPrimitives>,>(tName: TableName, valueMap: {[Property in keyof T as Exclude<Property, "_pk">]: T[Property]}): boolean => {
        const table = store.tables[tName];
        if (table) {
            let arrayProperties = getArrayProperties(table);
            // confirm valueMap has all properties
            for (let i = 0, len = arrayProperties.length; i < len; i++) {
                if (!(arrayProperties[i] in valueMap) && arrayProperties[i] !== '_pk') {
                    return false;
                }
            }

            for (let i = 0, len = arrayProperties.length; i < len; i++) {
                // Autoincrement on insert
                if (arrayProperties[i] === '_pk') {
                    table._pk.push(++tableKeys[tName]);
                    continue;
                }
                table[arrayProperties[i]].push(valueMap[arrayProperties[i]]);
            }

            notifyTableSubscribers('tableInsert', tName);
            // TODO: add entry to the _ledger
            // TODO: add locking
            // TODO: run triggers
            // TODO: check that all columns have the same lenght when inserting
            return true;
        }
        return false;
    };
    
    // TODO: this does not protect the column types
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
                notifyTableSubscribers('tableUpdate', tName);
                return true;
            }
        }
        return false;
    };

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
                for (const k in arrayProperties) {
                    table[arrayProperties[k]].splice(idx, 1);
                }
                notifyRowSubscribers('rowDelete', tName, pk);
                notifyTableSubscribers('tableDelete', tName);
                return true;
            }
        }
        return false;
    };

    const api: API = {
        getTable,
        getTableRow,
        findRow,
        insertTableRow,
        updateTableRow,
        deleteTableRow,
        registerTable,
        registerRow,
        unregisterTable,
        unregisterRow,
        setError,
    };

    const useBoundTable = <T extends Record<string, AllowedPrimitives>,>(t: TableName) => useTable<T>(api, t);
    const useBoundTableRow = <T extends Record<string, AllowedPrimitives>,>(t: TableName, pk: PK) => useTableRow<T>(api, t, pk);

    return {
        useTable: useBoundTable,
        useTableRow: useBoundTableRow,
        insertTableRow,
        findRow,
        updateTableRow,
        deleteTableRow,
    }
};



// someTable = useTable<T: TableEntry>('models'); // this can return an empty array


// Every table needs these actions
// Table actions:
// update()
// delete()
// insert()

// triggers (run on update/insert/delete)
// these more explicit names may help?
// useStoreError
// useStoreUpdate
// useStoreInsert
// useStoreDelete
// useStoreTable
// useStoreUpdateItem
// usetStoreInsertItem
// useStore() // when any action happens on the store
// useUpdate() // when an update action runs on the store
// useInsert() // when an insert action runs on the store
// useDelete() // when a delete action runs on the store
// useTable(store => store.tableName) // when any action runs on the table
// useUpdate(store => store.tableName) // when an update action runs on the table
// useInsert(store => store.tableName) // when an insert action runs on the table
// useDelete(store => store.tableName) // when a delete action runs on the table
// useUpdateEntry(store => store.tableName, 'primaryKey'); // returns the item
// useDeleteEntry(store => store.tableName, 'primaryKey');
// useCustomTable
// useCustomItem
// (...)

// you can see why zustand uses functions because it simplifies things, instead of needing
// all of these separate functions, but these separate functions are likely less intimidating than
// they seem

/*
    What I need to do is flatten my model to make it easier to subscribe to events
    as they occur, otherwise, I need to update entire chunks of my the program for no
    reason
*/


/* my problem is how nested everything is, it is creating a headache when it comes to
    updating. Like, how am I going to subscribe when a single thing updates?
    Why not store the markup like this anyway? The models are completely separate, so
    what benefit is there in having everything saved individually to the database?
*/

/*

    // Imagine how much code I will need to re-write!! Basically all of it
    // Yes, but you are already running into some pretty big issues with state management - how much worse will you let it get?

    // MOBX seems somewhat promising, but it is not really what I am after.

    // Every table needs these actions
    // Table actions:
    // update()
    // delete()
    // insert()

    // const items = useTable() =>
    // items.map(d => )

 
    // triggers (run on update/insert/delete)
    // useStore() // when any action happens on the store
    // useUpdate() // when an update action runs on the store
    // useInsert() // when an insert action runs on the store
    // useDelete() // when a delete action runs on the store
    // useTable(store => store.tableName) // when any action runs on the table
    // useUpdate(store => store.tableName) // when an update action runs on the table
    // useInsert(store => store.tableName) // when an insert action runs on the table
    // useDelete(store => store.tableName) // when a delete action runs on the table
    // useUpdateItem(store => store.tableName, 'primaryKey'); // returns the item
    // useInsertItem(store => store.tableName, 'primaryKey'); // returns the item's new state
    // useDeleteItem(store => store.tableName, 'primaryKey');
    // useUpdateItems('tableName', fn(t: TableType): TableType, []) // run the function against the values in the array. Empty array means all values. Final properties are then propagated back to the array list
    // useTableItem('tableName', uuid);

    ^
    // How to use the store and be notified of changes?
    // LEFT-OFF: mocking-up the API

    // we can use the uuid in the application, but enforce the primary keys on insert
    // we need to unregister our event listeners when the component unmounts

    model: uuid, name, description, folder_id, owner_id, ...
    blocks: uuid, blocktype // not sure this would be necessary, it is certainly more convenient
    dataframeblocks: uuid, blocktype, description
    dataframeBlockAttributes: uuid, blockUUID, (...), order?
    (...) other block types
    blockPositions: uuid, left, top // these are a 1-to-1 relationship, so not really necessary
    blockSizes: uuid, width, height // these are a 1-to-1 relationship, so not really necessary
    blockconnectors: inputUUID, outputUUID (unique composite)
    parameters: uuid, typeUUID, name, description, isRequired
    parameterTypes: uuid, type
    parameterBoolean: uuid, typeUUID, parameterUUID, defaultValue
    parameterSelect: uuid, typeUUID  parameterUUID, multiSelect, valueType, valueBinding, defaultValue
    parameterSelectOptions: uuid, typeUUID parameterSelectUUID, optionValue, description
    parameterFreeForm: uuid, typeUUID parameterUUID, valueType, defaultValue
    switchBlock: uuid, blockType, description, descriptionHeight
    switchBlockConditions: uuid, sbUUID
    switchBlockCondition: uuid, sbUUID, source
    switchBlockConditionConnectors: uuid, blockUUID // we don't check for null, it just isn't there


    /*

    // subscribe
    // INSERT()
    // DELETE()
    // UPDATE()




    Ok, let's say I do this, that I switch to this approach. How do I:

        - subscribe to the changes I care about
        - apply triggers to the tables?
        - add _runtime properties?



        // Here is a great example, how does this know that the block was deleted?
        // I guess the parameter will need to subscribe to the appropriate blocks table?
        component(blockUUID) => {

            // we could have the component itself subscribe to the changes it is making
            // this way we design for coarse and fine grain control
            // we still keep the markup approach because I don't want to handle
            // actual database operations for this

            const blockDescription = useStore(state => ) // how do I know which block to subscribe to?
            ^ this is the problem, how do I subscribe to notifications for a particular object in the state?
            ^ left-off, this is my logic problem right now, subscribing to an individual entity (row) in the store
            const changeBlockDescription = useStore(); // this piece is easy

            handleUpdateDescription() {
                changeBlockDescription(UUID);

            }


        }





        type SwitchCondition = {
        expression: Expression; // when-then expressions
        block: null | UUID; // if incoming block is null, then this needs to be a DataTable or DataQuery
    }
    
    type SwitchBlock = BlockBase & {
        blockType: 'switch';
        block: {
            inputBlock: null | UUID;
            userInterface: {
                descriptionHeight: number;
            };
            conditions: SwitchCondition[];
        };
        runtime: {
            _inputHandle: null | HTMLSpanElement;
            _outputHandles: Record<UUID, HTMLSpanElement>;
        };
    }







    ^The problem above is to now find my connectors, I need to loop through a bunch of arrays (1 
        for each kind of block I have). This is where you apply "triggers", to the tables, similar
        to how you would with a database

    // But I have been down this path and it resulted in A LOT of boilerplate.

    // Having multiple 1-to-1relationships means I need to update multiple arrays when
    // something is added/removed



    // Am I still thinking too much about the things and their properties? Making these relational
    // isn't hard, but making them not be cumbersome is difficult



    blocktype: uuid, name





        type DataBlockDataFrame = DataBlockBase & {
        blockType: 'dataFrame';
        block: {
            inputBlock: null | UUID;
            query: {
                select: DataBlockAttribute[];
                from: UUID;
                where: string;
                groupBy: string;
                having: string;
                orderBy: string;
                top?: number;
            }
        },
        runtime: {
            _inputHandle: null | HTMLSpanElement; 
        }
    }


    // we can store nested objects and reference those if we want.


*/