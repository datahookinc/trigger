import { useEffect, useRef, useState } from 'react';

const errorStyling = `
    background-color: black;
    padding: 8px;
    font-family: Roboto, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
`;

function logError(error: string) {
    console.log(
        `%c⚡Error in @datahook/trigger: %c${error}`,
        `${errorStyling} border-left: 1px solid yellow; color: red; font-weight: bold`,
        `${errorStyling} color: white`,
    );
}

function logWarning(error: string) {
    console.log(
        `%c⚡Warning in @datahook/trigger: %c${error}`,
        `${errorStyling} border-left: 1px solid yellow; color: yellow; font-weight: bold`,
        `${errorStyling} color: white`,
    );
}

function newError(error: string): Error {
    return new Error(`⚡Error in @datahook/trigger: ${error}`);
}

function logAndThrowError(error: string) {
    logError(error);
    throw newError(error);
}

/** Autoincrementing _id required for tables */
type AUTOID = number;

type TableNotify = 'onInsert' | 'onDelete' | 'onUpdate';
type RowNotify = 'onUpdate' | 'onDelete';
/** Notify is a union of the available notification events that can be subscribed to
 * - insert
 * - delete
 * - update
 */
type Notify = TableNotify | RowNotify;

type QueueTrigger = 'onInsert' | 'onGet';

type Subscribe<T> = {
    notify: Notify[];
    fn(v: T): void;
};

// SingleSubscribe is for "Single" data types in the Store (e.g., not tables)
type SingleSubscribe<T> = (v: T) => void;

type AllowedPrimitives = string | number | Date | boolean | null;

// UserRow is what the user provides (without the _id property)
type UserRow = { [index: string]: AllowedPrimitives }; // & { _id?: never}; TODO: ensure user does not try to pass-in _id property during initialization

export type FetchStatus = 'idle' | 'error' | 'loading' | 'success';

// TableRow is the UserRow decorated with the _id property
export type TableRow<T> = { [K in keyof T]: T[K] } & { _id: number };

export interface Store {
    tables?: {
        [index: string]: Table<ReturnType<<T extends UserRow>() => T>>;
    };
    queues?: {
        [index: string]: Queue<unknown>;
    };
    singles?: {
        [index: string]: Single<unknown>;
    };
}
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
    refreshOn?: unknown[]; // stubbed for now
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
}

export type DefinedTable<T> = { [K in keyof T]: T[K][] }; // This is narrowed during CreateTable to ensure it extends TableRow

export type Table<T extends UserRow> = {
    use(where?: ((row: TableRow<T>) => boolean) | null, notify?: TableNotify[]): TableRow<T>[];
    useById(_id: AUTOID, notify?: RowNotify[]): TableRow<T> | undefined;
    useLoadData(queryFn: () => Promise<T[]> | undefined, options?: TableRefreshOptions<T>): { data: TableRow<T>[]; status: FetchStatus; error: string | null };
    insertOne(row: T): TableRow<T> | undefined; // undefined if user aborts row insertion through the onBeforeInsert trigger
    insertMany(rows: T[], batchNotify?: boolean): TableRow<T>[];
    onBeforeInsert(fn: (row: TableRow<T>) => TableRow<T> | void | boolean): void;
    onAfterInsert(fn: (row: TableRow<T>) => void): void;
    deleteById(_id: AUTOID): boolean;
    deleteOne(where: Partial<T> | ((row: TableRow<T>) => boolean)): boolean; // delete the first row that matches the property values provided, or the function
    deleteMany(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, batchNotify?: boolean): number; // returns the number of deleted rows, 0 if none where deleted. Deletes all rows if no argument is provided
    onBeforeDelete(fn: (row: TableRow<T>) => boolean | void): void;
    onAfterDelete(fn: (row: TableRow<T>) => void): void;
    updateById(_id: AUTOID, setValue: Partial<T> | ((row: TableRow<T>) => Partial<T>), render?: boolean): TableRow<T> | undefined;
    updateMany(
        setValue: Partial<T> | ((row: TableRow<T>) => Partial<T>),
        where?: Partial<T> | ((row: TableRow<T>) => boolean) | null,
        options?: UpdateManyOptions
    ): TableRow<T>[];
    onBeforeUpdate(fn: (currentValue: TableRow<T>, newValue: TableRow<T>) => TableRow<T> | void | boolean): void;
    onAfterUpdate(fn: (previousValue: TableRow<T>, newValue: TableRow<T>) => void): void;
    findById(_id: AUTOID): TableRow<T> | undefined;
    findOne(where?: Partial<T> | ((v: TableRow<T>) => boolean)): TableRow<T> | undefined; // returns the first row that matches
    find(where?: Partial<T> | ((v: TableRow<T>) => boolean)): TableRow<T>[]; // returns all rows that match
    count(where?: Partial<T> | ((v: TableRow<T>) => boolean)): number;
    columnNames(): (keyof TableRow<T>)[]; // returns a list of the column names in the table
    print(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, n?: number): void; // a wrapper for console.table() API; by default will print the first 50 rows
    clear(resetIndex?: boolean): void; // clear the tables contents
    scan(fn: (row: TableRow<T>, idx: number) => boolean | void): void; // scan through the table's rows; returning "false" will stop the scan
};

// _checkTable throws an error if the table is not instantiated correctly.
// if instantiated correctly, it returns the number of initialized elements for seeding the autoAUTOID for the table
function _checkTable<T>(t: DefinedTable<T>): number {
    // check that the user provided at least one column that is not the '_id'
    if (Object.keys(t).filter((d) => d !== '_id').length === 0) {
        throw newError(`invalid initial arguments when creating table; cannot create an empty table`);
    }

    // check if user provided initial values and if each array has the same number
    let nInitialLength = -1;
    for (const k in t) {
        // _id is automtically reset, so we can ignore it here
        if (k === '_id') {
            continue;
        }
        if (nInitialLength === -1) {
            nInitialLength = t[k].length;
        }
        if (nInitialLength !== t[k].length) {
            throw newError(
                `invalid initial arguments when creating table; column "${k}" has improper length of ${t[k].length}, which does not match the length of the other columns provided`,
            );
        }
    }

    return nInitialLength;
}

// This might work out that the triggers just need to send back the value, we don't need to provide the API because the user can do whatever they want as a normal function.
export function CreateTable<T extends UserRow>(t: DefinedTable<T> | (keyof T)[]): Table<TableRow<T>> {
    // turn t into an object if provided as an array of column names; will implicitly remove duplicate column names
    if (t instanceof Array) {
        t = t.reduce<{ [K in keyof T]: T[K][] }>((acc, cur) => {
            acc[cur] = [];
            return acc;
        }, {} as DefinedTable<T>);
    }
    const nInitialLength = _checkTable(t);
    // setup the autoID (accounting for any initial values)
    let autoID: AUTOID = 0;
    const initialAUTOID: AUTOID[] = [];
    for (let i = 0; i < nInitialLength; i++) {
        initialAUTOID[i] = ++autoID;
    }
    const initialValues = { ...t, _id: initialAUTOID } as DefinedTable<TableRow<T>>; // put AUTOID last to override it if the user passes it in erroneously
    const table: DefinedTable<TableRow<T>> = initialValues; // manually add the "_id" so the user does not need to
    const originalColumnNames = Object.keys(t); // the user provided column names
    const columnNames: (keyof T)[] = Object.keys(initialValues); // the user provided column names + "_id"
    const tableSubscribers: Subscribe<TableRow<T>[]>[] = [];
    const rowSubscribers: Record<AUTOID, Subscribe<TableRow<T> | undefined>[]> = {};
    let triggerBeforeInsert: undefined | ((v: TableRow<T>) => TableRow<T> | void | boolean) = undefined;
    let triggerAfterInsert: undefined | ((v: TableRow<T>) => void) = undefined;
    let triggerBeforeDelete: undefined | ((v: TableRow<T>) => boolean | void) = undefined;
    let triggerAfterDelete: undefined | ((v: TableRow<T>) => void) = undefined;
    let triggerBeforeUpdate: undefined | ((cv: TableRow<T>, nv: TableRow<T>) => TableRow<T> | void | boolean) = undefined;
    let triggerAfterUpdate: undefined | ((pv: TableRow<T>, nv: TableRow<T>) => void) = undefined;

    const _getAllRows = (): TableRow<T>[] => {
        const entries: TableRow<T>[] = [];
        for (let i = 0, numValues = table['_id'].length; i < numValues; i++) {
            const entry = {} as TableRow<T>;
            for (let j = 0, numArrays = columnNames.length; j < numArrays; j++) {
                entry[columnNames[j]] = table[columnNames[j]][i];
            }
            entries.push(entry);
        }
        return entries;
    };

    const _getRowCount = (): number => {
        return table['_id'].length;
    };

    /**
     * Convenience function for returning a table row based on the provided index.
     * The function will return undefined if the provided index is out of range (e.g., greater than the number of rows in the table)
     * @param idx
     * @returns TableRow | undefined
     */
    function _getRowByIndex(idx: number): TableRow<T> | undefined {
        if (idx < _getRowCount()) {
            const entry = {} as TableRow<T>;
            for (const k of columnNames) {
                entry[k] = table[k][idx];
            }
            return entry;
        }
        return undefined;
    }

    /**
     * Convenience function for returning a table row based on the provided autoID
     * The function will return undefined if the provided index is out of range (e.g., greater than the number of rows in the table)
     * @param AUTOID
     * @returns TableRow | undefined
     */
    function _getRowByAUTOID(AUTOID: AUTOID): TableRow<T> | undefined {
        if (AUTOID < 0) {
            return undefined;
        }
        for (let i = 0, len = _getRowCount(); i < len; i++) {
            if (table._id[i] === AUTOID) {
                return _getRowByIndex(i);
            }
        }
        return undefined;
    }

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

    const registerTable = (fn: (v: TableRow<T>[]) => void, notify: TableNotify[]) => {
        tableSubscribers.push({
            notify,
            fn,
        });
    };

    const unregisterTable = (fn: (v: TableRow<T>[]) => void) => {
        tableSubscribers.filter((d) => d.fn !== fn);
    };

    const notifyTableSubscribers = (ne: TableNotify) => {
        const subs = tableSubscribers.filter((s) => s.notify.length === 0 || s.notify.includes(ne));
        if (subs.length > 0) {
            const rows = _getAllRows(); // PERFORMANCE: One of the downsides is we end-up creating a lot of objects each time the table changes
            for (let i = 0, len = subs.length; i < len; i++) {
                subs[i].fn(rows);
            }
        }
    };

    const notifyRowSubscribers = (ne: RowNotify, AUTOID: AUTOID) => {
        if (rowSubscribers[AUTOID] && rowSubscribers[AUTOID].length > 0) {
            const subs = rowSubscribers[AUTOID].filter((s) => s.notify.length === 0 || s.notify.includes(ne));
            if (subs.length > 0) {
                const row = _getRowByAUTOID(AUTOID);
                for (let i = 0, len = subs.length; i < len; i++) {
                    subs[i].fn(row);
                }
            }
        }
    };

    const registerRow = (AUTOID: AUTOID, fn: (v: TableRow<T>) => void, notify: RowNotify[]) => {
        if (!rowSubscribers[AUTOID]) {
            rowSubscribers[AUTOID] = [];
        }

        rowSubscribers[AUTOID].push({
            notify,
            fn,
        });
    };

    const unregisterRow = (AUTOID: AUTOID, fn: (v: TableRow<T>) => void) => {
        if (rowSubscribers[AUTOID]) {
            rowSubscribers[AUTOID] = rowSubscribers[AUTOID].filter((d) => d.fn !== fn);
            if (rowSubscribers[AUTOID].length === 0) {
                delete rowSubscribers[AUTOID]; // remove the property entirely if there are no listeners
            }
        }
    };

    const _insertRow = (newRow: T): TableRow<T> | undefined => {
        const newAUTOID = autoID + 1;
        let entry = {
            _id: newAUTOID,
            ...newRow,
        } as TableRow<T>;

        if (triggerBeforeInsert) {
            const v = triggerBeforeInsert(entry);
            // user has elected to abort the insert
            if (v === false) {
                return undefined;
            }
            // if the user returns a type (potentially with changes), then we reassign the values to entry
            if (typeof v === 'object') {
                entry._id = newAUTOID; // protect against the user changing the intended autoID
                if (typeof v === 'object') {
                    entry = v;
                }
            }
        }
        ++autoID; // commit change to autoID
        for (const k in entry) {
            table[k].push(entry[k]);
        }

        // pass entry to trigger
        if (triggerAfterInsert) {
            triggerAfterInsert(entry);
        }

        // return the entry to the calling function
        return entry;
    };

    const _insertRows = (newRows: T[], batchNotify = true): TableRow<T>[] => {
        const entries: TableRow<T>[] = [];
        // check all rows first to avoid side-effects
        newRows.forEach((r) => _validateRow(r));

        for (let i = 0, len = newRows.length; i < len; i++) {
            const entry = _insertRow(newRows[i]);
            if (entry) {
                if (!batchNotify) {
                    notifyTableSubscribers('onInsert');
                }
                entries.push(entry);
            }
        }
        if (batchNotify) {
            notifyTableSubscribers('onInsert');
        }
        return entries;
    };

    const _deleteRow = (idx: number, entry: TableRow<T>): boolean => {
        if (triggerBeforeDelete) {
            const v = triggerBeforeDelete(entry);
            // user has elected to abort the delete
            if (v === false) {
                return false;
            }
        }

        for (const k of columnNames) {
            table[k].splice(idx, 1);
        }

        if (triggerAfterDelete) {
            triggerAfterDelete(entry);
        }

        return true;
    };

    const _updateRow = (idx: number, cv: TableRow<T>, nv: Partial<T>): TableRow<T> | undefined => {
        // merge the two values
        const merged = {
            ...cv,
            ...nv,
            _id: cv._id, // extra precaution
        };

        let updateValue = merged;
        if (triggerBeforeUpdate) {
            const res = triggerBeforeUpdate(cv, merged);
            if (res === false) {
                return undefined;
            }
            if (typeof res === 'object') {
                updateValue = res;
            }
        }

        for (const k in updateValue) {
            if (table[k] !== undefined && k !== '_id') {
                const v = updateValue[k];
                if (v !== undefined) {
                    table[k][idx] = v;
                }
            }
        }

        if (triggerAfterUpdate) {
            triggerAfterUpdate(cv, updateValue);
        }

        return updateValue;
    };

    const _validateRow = (row: T): boolean => {
        const rowKeys = new Set(Object.keys(row));
        const colKeys = new Set(originalColumnNames);
        if (rowKeys.has('_id')) {
            logWarning(`attempting to pass value for "_id" when inserting rows; the "_id" property is handled automatically and will be ignored when received`);
            rowKeys.delete('_id');
        }

        for (const elem of rowKeys) {
            if (!colKeys.has(elem)) {
                logAndThrowError(`attempting to insert value into column "${elem}", which does not exist in table`);
            }
        }

        for (const elem of colKeys) {
            if (!rowKeys.has(elem)) {
                logAndThrowError(`did not provide column "${elem}" when attempting to insert row into table`);
            }
        }

        return true;
    };

    const _getRows = (where?: Partial<T> | ((v: TableRow<T>) => boolean) | null): TableRow<T>[] => {
        const numRows = _getRowCount();
        if (numRows > 0) {
            switch (typeof where) {
                case 'undefined': {
                    return _getAllRows();
                }
                case 'function': {
                    const entries: TableRow<T>[] = [];
                    // loop through the rows until we find a matching index, returns the first match if any
                    for (let i = 0, len = numRows; i < len; i++) {
                        const entry = _getRowByIndex(i);
                        if (entry && where(entry)) {
                            entries.push(entry);
                        }
                    }
                    return entries;
                }
                case 'object': {
                    if (where === null) {
                        return _getAllRows();
                    }
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
                        const entries: TableRow<T>[] = [];
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
                                const entry = _getRowByIndex(i);
                                if (entry) {
                                    entries.push(entry);
                                }
                            }
                        }
                        return entries;
                    }
                }
            }
        }
        return [];
    };

    const _clearTable = () => {
        for (const k of columnNames) {
            table[k] = [];
        }
    };

    return {
        use(where: ((row: TableRow<T>) => boolean) | null = null, notify: TableNotify[] = []): TableRow<T>[] {
            const [v, setV] = useState<TableRow<T>[]>(() => (where ? _getAllRows().filter(where) : _getAllRows())); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid exhaustive-deps warning, and to avoid calling useEffect everytime v changes
            const hasChanged = useRef((newValues: TableRow<T>[]) => tableHasChanged(v, newValues));
            const notifyList = useRef(Array.from(new Set(notify)));
            const whereClause = useRef(where);
            hasChanged.current = (newValues: TableRow<T>[]) => tableHasChanged(v, newValues);

            useEffect(() => {
                const subscribe = (nv: TableRow<T>[]) => {
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
                const currentTableValues = whereClause.current ? _getAllRows().filter(whereClause.current) : _getAllRows();
                setV(currentTableValues);
                // unregister when component unmounts;
                return () => {
                    unregisterTable(subscribe);
                };
            }, [t]);
            return v;
        },
        useLoadData(
            queryFn: () => Promise<T[]> | undefined,
            options?: TableRefreshOptions<T>,
        ): { data: TableRow<T>[]; status: FetchStatus; error: string | null } {
            const ops: TableRefreshOptions<T> = {
                refreshOn: [],
                refreshMode: 'replace',
                resetIndex: false,
                notify: [],
                fetchOnMount: true,
                ...options,
            };

            const isQuerying = useRef(false);
            const [status, setStatus] = useState<FetchStatus>('idle');
            const [data, setData] = useState<TableRow<T>[]>(ops.filter ? _getAllRows().filter(ops.filter) : _getAllRows());
            const [error, setError] = useState<string | null>(null);

            // NOTE: this is required to avoid exhaustive-deps warning, and to avoid calling useEffect everytime v changes
            const hasChanged = useRef((newValues: TableRow<T>[]) => tableHasChanged(data, newValues));
            const notifyList = useRef(Array.from(new Set(ops.notify)));
            const whereClause = useRef(ops.filter);
            hasChanged.current = (newValues: TableRow<T>[]) => tableHasChanged(data, newValues);

            // responsible for loading data into the table
            useEffect(() => {
                if (!isQuerying.current && ops.fetchOnMount) {
                    isQuerying.current = true;
                    setStatus('loading');
                    queryFn()
                        ?.then((d) => {
                            if (ops.refreshMode === 'replace') {
                                _clearTable();
                                if (ops.resetIndex) {
                                    autoID = 0;
                                }
                            }
                            _insertRows(d, true); // validates all rows before insertion
                            setData(ops.filter ? _getAllRows().filter(ops.filter) : _getAllRows());
                            setStatus('success');
                            setError(null);
                            if (ops.onSuccess) {
                                ops.onSuccess();
                            }
                        })
                        .catch((err) => {
                            setStatus('error');
                            setData([]);
                            setError(String(err));
                        }).finally(() => isQuerying.current = false);
                }
            }, ops.refreshOn);

            // similar to use(); responsible for updating the component when there are changes to the table
            useEffect(() => {
                const subscribe = (nv: TableRow<T>[]) => {
                    if (whereClause.current) {
                        // compare to see if changes effect rows this component is hooking into
                        const filtered = nv.filter(whereClause.current);
                        if (hasChanged.current(filtered)) {
                            setData(nv.filter(whereClause.current));
                        }
                    } else {
                        setData(nv);
                    }
                };

                registerTable(subscribe, notifyList.current);

                // NOTE: Initialize here because of the delay between useState and useEffect which means
                // changes could have been dispatched before this component was registered to listen for them
                const currentTableValues = whereClause.current ? _getAllRows().filter(whereClause.current) : _getAllRows();
                setData(currentTableValues);
                // unregister when component unmounts;
                return () => {
                    unregisterTable(subscribe);
                };
            }, [t]);
            return { data, status, error };
        },
        useById(AUTOID: AUTOID, notify: RowNotify[] = []): TableRow<T> | undefined {
            const [v, setV] = useState<TableRow<T> | undefined>(() => _getRowByAUTOID(AUTOID)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid firing useEffect when the notify object reference changes
            const notifyList = useRef(Array.from(new Set(notify)));
            useEffect(() => {
                const subscribe = (nv: TableRow<T> | undefined) => {
                    setV(nv);
                };
                registerRow(AUTOID, subscribe, notifyList.current);
                setV(_getRowByAUTOID(AUTOID));
                // unregister when component unmounts;
                return () => {
                    unregisterRow(AUTOID, subscribe);
                };
            }, [t, AUTOID]);
            return v;
        },
        insertOne(newRow: T): TableRow<T> | undefined {
            _validateRow(newRow);
            const entry = _insertRow(newRow);
            if (entry) {
                notifyTableSubscribers('onInsert');
            }
            return entry;
        },
        insertMany(newRows: T[], batchNotify = true): TableRow<T>[] {
            return _insertRows(newRows, batchNotify);
        },
        deleteById(_id: AUTOID): boolean {
            let i = table._id.length;
            while (i--) {
                if (table._id[i] === _id) {
                    const entry = _getRowByIndex(i);
                    if (entry) {
                        const deleted = _deleteRow(i, entry);
                        if (deleted) {
                            // notify subscribers of changes to row and table
                            notifyRowSubscribers('onDelete', entry._id);
                            notifyTableSubscribers('onDelete');
                        }
                        return deleted;
                    }
                }
            }
            return false;
        },
        deleteOne(where: AUTOID | Partial<T> | ((row: TableRow<T>) => boolean)): boolean {
            let i = table._id.length;
            while (i--) {
                let remove = false;
                switch (typeof where) {
                    case 'number': {
                        if (table._id[i] === where) {
                            remove = true;
                        }
                        break;
                    }
                    case 'function': {
                        const entry = _getRowByIndex(i);
                        if (entry && where(entry)) {
                            remove = true;
                        }
                        break;
                    }
                    case 'object': {
                        const keys = Object.keys(where);
                        // make sure the requested columns exist in the table; if they don't all exist, return undefined
                        for (const k of keys) {
                            if (!columnNames.includes(k)) {
                                return false;
                            }
                        }

                        let allMatch = true;
                        for (const k of keys) {
                            if (where[k] !== table[k][i]) {
                                allMatch = false;
                                break;
                            }
                        }
                        if (allMatch) {
                            remove = true;
                        }
                    }
                }
                if (remove) {
                    const entry = _getRowByIndex(i);
                    if (entry) {
                        const deleted = _deleteRow(i, entry);
                        if (deleted) {
                            // notify subscribers of changes to row and table
                            notifyRowSubscribers('onDelete', entry._id);
                            notifyTableSubscribers('onDelete');
                        }
                        return deleted;
                    }
                    break; // only delete the first instance
                }
            }
            return false;
        },
        deleteMany(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, batchNotify = true): number {
            let i = table._id.length;
            let numRemoved = 0;
            while (i--) {
                let remove = false;
                switch (typeof where) {
                    // passing undefined means to delete all rows
                    case 'undefined': {
                        remove = true;
                        break;
                    }
                    case 'number': {
                        if (table._id[i] === where) {
                            remove = true;
                        }
                        break;
                    }
                    case 'function': {
                        const entry = _getRowByIndex(i);
                        if (entry && where(entry)) {
                            remove = true;
                        }
                        break;
                    }
                    case 'object': {
                        // passing null is the same as passing undefined
                        if (where === null) {
                            remove = true;
                            break;
                        }
                        const keys = Object.keys(where);
                        // make sure the requested columns exist in the table; if they don't all exist, return undefined
                        for (const k of keys) {
                            if (!columnNames.includes(k)) {
                                return 0;
                            }
                        }

                        let allMatch = true;
                        for (const k of keys) {
                            if (where[k] !== table[k][i]) {
                                allMatch = false;
                                break;
                            }
                        }
                        if (allMatch) {
                            remove = true;
                        }
                    }
                }
                if (remove) {
                    const entry = _getRowByIndex(i);
                    if (entry) {
                        const deleted = _deleteRow(i, entry);
                        if (deleted) {
                            // notify subscribers of changes to row and table
                            notifyRowSubscribers('onDelete', entry._id);
                            if (!batchNotify) {
                                notifyTableSubscribers('onDelete');
                            }
                            numRemoved++;
                        }
                    }
                }
            }
            if (batchNotify) {
                notifyTableSubscribers('onDelete');
            }
            return numRemoved;
        },
        updateById(AUTOID: AUTOID, setValue: Partial<T> | ((row: TableRow<T>) => Partial<T>), render = true): TableRow<T> | undefined {
            let idx = -1;
            // find the idx where the AUTOID exists in this table
            for (let i = 0, len = table._id.length; i < len; i++) {
                if (table._id[i] === AUTOID) {
                    idx = i;
                    break;
                }
            }
            if (idx >= 0) {
                const currentEntry = _getRowByIndex(idx);
                if (currentEntry) {
                    let updated: TableRow<T> | undefined = undefined;
                    switch (typeof setValue) {
                        case 'object': {
                            for (const k in setValue) {
                                if (!columnNames.includes(k)) {
                                    logError(`Invalid column provided "${k}"`);
                                    return undefined;
                                }
                            }
                            updated = _updateRow(idx, currentEntry, setValue);
                            break;
                        }
                        case 'function': {
                            const nv = setValue(currentEntry);
                            updated = _updateRow(idx, currentEntry, nv);
                            break;
                        }
                    }
                    if (updated && render) {
                        // notify subscribers of changes to row and table
                        notifyRowSubscribers('onUpdate', currentEntry._id);
                        notifyTableSubscribers('onUpdate');
                    }
                    return updated;
                }
            }
            return undefined;
        },
        updateMany(
            setValue: Partial<T> | ((row: TableRow<T>) => Partial<T>),
            where?: Partial<T> | ((row: TableRow<T>) => boolean) | null,
            options?: UpdateManyOptions
        ): TableRow<T>[] {
            const ops: UpdateManyOptions = {
                batchNotify: true,
                render: true,
                ...options,
            };

            let idx = table._id.length;
            const entries: TableRow<T>[] = [];
            while (idx--) {
                let update = false;
                switch (typeof where) {
                    case 'undefined': {
                        update = true;
                        break;
                    }
                    case 'function': {
                        const entry = _getRowByIndex(idx);
                        if (entry && where(entry)) {
                            update = true;
                        }
                        break;
                    }
                    case 'object': {
                        if (where === null) {
                            update = true;
                            break;
                        }
                        const keys = Object.keys(where);
                        // make sure the requested columns exist in the table; if they don't all exist, return undefined
                        for (const k of keys) {
                            if (!columnNames.includes(k)) {
                                return [];
                            }
                        }

                        let allMatch = true;
                        for (const k of keys) {
                            if (where[k] !== table[k][idx]) {
                                allMatch = false;
                                break;
                            }
                        }
                        if (allMatch) {
                            update = true;
                        }
                    }
                }
                if (update) {
                    const currentEntry = _getRowByIndex(idx);
                    if (currentEntry) {
                        let updated: TableRow<T> | undefined = undefined;
                        switch (typeof setValue) {
                            case 'object': {
                                for (const k in setValue) {
                                    if (!columnNames.includes(k)) {
                                        logError(`Invalid column provided "${k}"`);
                                        return [];
                                    }
                                }
                                updated = _updateRow(idx, currentEntry, setValue);
                                break;
                            }
                            case 'function': {
                                const nv = setValue(currentEntry);
                                updated = _updateRow(idx, currentEntry, nv);
                                break;
                            }
                        }

                        if (updated) {
                            if (ops.render) {
                                notifyRowSubscribers('onUpdate', currentEntry._id);
                                if (!ops.batchNotify) {
                                    notifyTableSubscribers('onUpdate');
                                }
                            }
                            entries.push(updated);
                        }
                    }
                }
            }
            if (ops.render && ops.batchNotify) {
                notifyTableSubscribers('onUpdate');
            }
            return entries;
        },
        find(where?: Partial<T> | ((row: TableRow<T>) => boolean)): TableRow<T>[] {
            return _getRows(where);
        },
        findById(_id: AUTOID): TableRow<T> | undefined {
            return _getRowByAUTOID(_id);
        },
        findOne(where?: Partial<T> | ((row: TableRow<T>) => boolean)): TableRow<T> | undefined {
            const numRows = _getRowCount();
            let idx = -1;
            if (numRows > 0) {
                switch (typeof where) {
                    case 'function': {
                        // loop through the rows until we find a matching index, returns the first match if any
                        const entry = {} as TableRow<T>;
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
                        idx = 0; // return the first row if no criteria is provided
                        break;
                    }
                }
            }
            if (idx >= 0) {
                const entry = _getRowByIndex(idx);
                if (entry) {
                    return entry;
                }
            }
            return undefined;
        },
        count(where?: Partial<T> | ((row: TableRow<T>) => boolean)): number {
            switch (typeof where) {
                case 'object': {
                    // make sure the requested columns exist in the table; if they don't all exist, return undefined
                    const keys = Object.keys(where);
                    for (const k of keys) {
                        if (!columnNames.includes(k)) {
                            return 0;
                        }
                    }
                    const numRows = _getRowCount();
                    let n = 0;
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
                            n++;
                        }
                    }
                    return n;
                }
                case 'function': {
                    const numRows = _getRowCount();
                    let n = 0;
                    for (let i = 0, len = numRows; i < len; i++) {
                        const entry = {} as TableRow<T>;
                        for (const k of columnNames) {
                            entry[k] = table[k][i];
                        }
                        if (where(entry)) {
                            n++;
                        }
                    }
                    return n;
                }
            }
            return table._id.length;
        },
        columnNames(): (keyof T)[] {
            return columnNames.sort();
        },
        onBeforeInsert(fn: (row: TableRow<T>) => TableRow<T> | boolean | void) {
            triggerBeforeInsert = fn;
        },
        onAfterInsert(fn: (row: TableRow<T>) => void) {
            triggerAfterInsert = fn;
        },
        onBeforeDelete(fn: (row: TableRow<T>) => boolean | void) {
            triggerBeforeDelete = fn;
        },
        onAfterDelete(fn: (row: TableRow<T>) => void) {
            triggerAfterDelete = fn;
        },
        onBeforeUpdate(fn: (currentValue: TableRow<T>, newValue: TableRow<T>) => boolean | void) {
            triggerBeforeUpdate = fn;
        },
        onAfterUpdate(fn: (previousValue: TableRow<T>, newValue: TableRow<T>) => void) {
            triggerAfterUpdate = fn;
        },
        print(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, n = 50) {
            let rows = _getRows(where);
            rows = n == -1 ? rows : rows.slice(0, n);

            if (rows.length === 0) {
                const cols = this.columnNames();
                console.log('No rows found');
                console.table(Object.fromEntries(cols.map((d) => [d, []]))); // add an empty array to each column name
                return;
            }

            // transform the rows so the index is the _id instead of an arbitrary number
            const transformed = rows.reduce((acc, { _id, ...x }) => {
                acc[_id] = x;
                return acc;
            }, {} as { [index: number]: Omit<TableRow<T>, '_id'> });
            console.table(transformed);
        },
        clear(resetIndex = true) {
            _clearTable();
            if (resetIndex) {
                autoID = 0;
            }
        },
        scan(fn: (row: TableRow<T>, idx: number) => boolean | undefined) {
            for (let i = 0, len = _getRowCount(); i < len; i++) {
                const currentEntry = _getRowByIndex(i);
                if (!currentEntry) {
                    break;
                }
                if (fn(currentEntry, i) === false) {
                    break;
                }
            }
        },
    };
}

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
export function CreateQueue<T>(): Queue<T> {
    const q: QueueItem<T>[] = [];
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
        get(): T | undefined {
            const item = q.shift();
            if (item) {
                // pass entry to trigger
                if (triggers['onGet']) {
                    triggers['onGet'](item.item);
                }
            }
            return item?.item;
        },
        size(): number {
            return q.length;
        },
        onInsert(fn: (newItem: T) => void) {
            triggers['onInsert'] = fn;
        },
        onGet(fn: (item: T) => void) {
            triggers['onGet'] = fn;
        },
    };
}

export type Single<T> = {
    use(where?: (currentValue: T) => boolean | undefined): T;
    // Note: See this thread for more information about working around the call signature: https://github.com/microsoft/TypeScript/issues/37663 for why (newValue: T | ((currentValue: T) => T)): T won't work
    set(newValue: T): T;
    setFn(fn: (currentValue: T) => T): T;
    onSet(fn: (previousValue: T, newValue: T) => void): void;
    onGet(fn: (value: T) => void): void;
    get(): T;
};

export function CreateSingle<T>(s: T): Single<T> {
    let single = s;
    let subscribers: SingleSubscribe<T>[] = [];
    let triggerOnSet: undefined | ((pv: T, nv: T) => void) = undefined;
    let triggerOnGet: undefined | ((v: T) => void) = undefined;

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
        use(where?: (currentValue: T) => boolean | undefined): T {
            const [v, setV] = useState<T>(() => single); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            const whereClause = useRef(where);
            useEffect(() => {
                const subscribe = (nv: T) => {
                    // check that the state should be updated
                    if (whereClause.current) {
                        if (whereClause.current(nv)) {
                            setV(nv);
                        }
                    } else {
                        setV(nv);
                    }
                };
                registerSingle(subscribe);
                setV(single);
                // unregister when component unmounts;
                return () => {
                    unregisterSingle(subscribe);
                };
            }, []);
            return v;
        },
        get(): T {
            // pass entry to trigger
            if (triggerOnGet) {
                triggerOnGet(single);
            }
            return single;
        },
        set(newValue: T): T {
            if (triggerOnSet) {
                triggerOnSet(single, newValue);
            }
            notifySubscribers(newValue); // we pass the value to save extra function calls within notifySingleSubscribers
            single = newValue;
            return single;
        },
        setFn(fn: (currentValue: T) => T): T {
            const v = fn(single);
            notifySubscribers(v); // we pass the value to save extra function calls within notifySingleSubscribers
            if (triggerOnSet) {
                triggerOnSet(single, v);
            }
            single = v;
            return single;
        },
        onSet(fn: (previousValue: T, newValue: T) => void) {
            triggerOnSet = fn;
        },
        onGet(fn: (value: T) => void) {
            triggerOnGet = fn;
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

// ExtractQueues changes properties to readonly and removes properties that should not be exposed
type ExtractQueues<T> = {
    readonly [K in keyof Omit<T, 'onInsert' | 'onGet'>]: T[K] extends Record<PropertyKey, unknown> ? ExtractQueues<T[K]> : T[K]; // omit the trigger functions because the user shouldn't be exposed to those.
};

export function extractQueues<T extends Store['queues']>(t: T): ExtractQueues<T> {
    return t;
}

// ExtractSingles changes properties to readonly and removes properties that should not be exposed
type ExtractSingles<T> = {
    readonly [K in keyof Omit<T, 'onSet' | 'onGet'>]: T[K] extends Record<PropertyKey, unknown> ? ExtractSingles<T[K]> : T[K]; // omit the trigger functions because the user shouldn't be exposed to those.
};

export function extractSingles<T extends Store['singles']>(t: T): ExtractSingles<T> {
    return t;
}

type Extracted<T extends Store> = {
    tables: ExtractTables<T['tables']>;
    singles: ExtractSingles<T['singles']>;
    queues: ExtractQueues<T['queues']>;
};

export function extract<T extends Store>(t: T): Extracted<T> {
    const extracted = {} as Extracted<T>;
    if (t.tables) {
        extracted.tables = t.tables as ExtractTables<T['tables']>;
    }
    if (t.singles) {
        extracted.singles = t.singles as ExtractSingles<T['singles']>;
    }
    if (t.queues) {
        extracted.queues = t.queues as ExtractQueues<T['queues']>;
    }
    return extracted;
}
