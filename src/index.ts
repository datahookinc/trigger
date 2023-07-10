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

type SingleTrigger = 'onGet' | 'onSet';
type QueueTrigger = 'onInsert' | 'onGet';

type Subscribe<T> = {
    notify: Notify[];
    fn(v: T): void;
};

// SingleSubscribe is for "Single" data types in the Store (e.g., not tables)
type SingleSubscribe<T> = (v: T) => void;

type AllowedPrimitives = string | number | Date | boolean | null;

// UserRow is what the user provides (without the _pk property)
type UserRow = { [index: string]: AllowedPrimitives }; // & { _pk?: never}; TODO: ensure user does not try to pass-in _pk property during initialization

export type FetchStatus = 'idle' | 'error' | 'loading' | 'success';

// TableRow is the UserRow decorated with the _pk property
export type TableRow<T> = { [K in keyof T]: T[K] } & { _pk: number };

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
    refreshOn?: unknown[];
    refreshMode?: 'replace' | 'append';
    resetIndex?: boolean;
    notify?: TableNotify[];
    fetchOnMount?: boolean;
    onSuccess?(): void;
    filter?: (row: TableRow<T>) => boolean;
};

export type DefinedTable<T> = { [K in keyof T]: T[K][] }; // This is narrowed during CreateTable to ensure it extends TableRow

export type Table<T extends UserRow> = {
    use(where?: ((row: TableRow<T>) => boolean) | null, notify?: TableNotify[]): TableRow<T>[];
    useLoadData(queryFn: () => Promise<T[]> | undefined, options?: TableRefreshOptions<T>): { data: TableRow<T>[]; status: FetchStatus; error: string | null };
    useRow(_pk: PK, notify?: RowNotify[]): TableRow<T> | undefined;
    insertRow(row: T): TableRow<T> | undefined; // undefined if user aborts row insertion through the onBeforeInsert trigger
    insertRows(rows: T[], batchNotify?: boolean): TableRow<T>[];
    onBeforeInsert(fn: (row: TableRow<T>) => TableRow<T> | void | boolean): void;
    onAfterInsert(fn: (row: TableRow<T>) => void): void;
    deleteRow(where: PK | Partial<T> | ((row: TableRow<T>) => boolean)): boolean; // delete the first row that matches the PK, the property values provided, or the function
    deleteRows(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, batchNotify?: boolean): number; // returns the number of deleted rows, 0 if none where deleted. Deletes all rows if no argument is provided
    onBeforeDelete(fn: (row: TableRow<T>) => boolean | void): void;
    onAfterDelete(fn: (row: TableRow<T>) => void): void;
    updateRow(_pk: PK, setValue: Partial<T> | ((row: TableRow<T>) => Partial<T>)): TableRow<T> | undefined;
    updateRows(
        setValue: Partial<T> | ((row: TableRow<T>) => Partial<T>),
        where?: Partial<T> | ((row: TableRow<T>) => boolean),
        batchNotify?: boolean,
    ): TableRow<T>[];
    onBeforeUpdate(fn: (currentValue: TableRow<T>, newValue: TableRow<T>) => TableRow<T> | void | boolean): void;
    onAfterUpdate(fn: (previousValue: TableRow<T>, newValue: TableRow<T>) => void): void;
    getRow(where: PK | Partial<T> | ((v: TableRow<T>) => boolean)): TableRow<T> | undefined; // returns the first row that matches
    getRows(where?: Partial<T> | ((v: TableRow<T>) => boolean)): TableRow<T>[]; // returns all rows that match
    getRowCount(where?: Partial<T> | ((v: TableRow<T>) => boolean)): number;
    getColumnNames(): (keyof TableRow<T>)[]; // returns a list of the column names in the table
    print(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, n?: number): void; // a wrapper for console.table() API; by default will print the first 50 rows
    clear(resetIndex?: boolean): void; // clear the tables contents
};

// _checkTable throws an error if the table is not instantiated correctly.
// if instantiated correctly, it returns the number of initialized elements for seeding the autoPK for the table
function _checkTable<T>(t: DefinedTable<T>): number {
    // check that the user provided at least one column that is not the '_pk'
    if (Object.keys(t).filter((d) => d !== '_pk').length === 0) {
        throw newError(`invalid initial arguments when creating table; cannot create an empty table`);
    }

    // check if user provided initial values and if each array has the same number
    let nInitialLength = -1;
    for (const k in t) {
        // _pk is automtically reset, so we can ignore it here
        if (k === '_pk') {
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
    // setup the primary keys (accounting for any initial values)
    let autoPK: PK = 0;
    const initialPK: PK[] = [];
    for (let i = 0; i < nInitialLength; i++) {
        initialPK[i] = ++autoPK;
    }
    const initialValues = { ...t, _pk: initialPK } as DefinedTable<TableRow<T>>; // put PK last to override it if the user passes it in erroneously
    const table: DefinedTable<TableRow<T>> = initialValues; // manually add the "_pk" so the user does not need to
    const originalColumnNames = Object.keys(t); // the user provided column names
    const columnNames: (keyof T)[] = Object.keys(initialValues); // the user provided column names + "_pk"
    const tableSubscribers: Subscribe<TableRow<T>[]>[] = [];
    const rowSubscribers: Record<PK, Subscribe<TableRow<T> | undefined>[]> = {};
    let triggerBeforeInsert: undefined | ((v: TableRow<T>) => TableRow<T> | void | boolean) = undefined;
    let triggerAfterInsert: undefined | ((v: TableRow<T>) => void) = undefined;
    let triggerBeforeDelete: undefined | ((v: TableRow<T>) => boolean | void) = undefined;
    let triggerAfterDelete: undefined | ((v: TableRow<T>) => void) = undefined;
    let triggerBeforeUpdate: undefined | ((cv: TableRow<T>, nv: TableRow<T>) => TableRow<T> | void | boolean) = undefined;
    let triggerAfterUpdate: undefined | ((pv: TableRow<T>, nv: TableRow<T>) => void) = undefined;

    const _getAllRows = (): TableRow<T>[] => {
        const entries: TableRow<T>[] = [];
        for (let i = 0, numValues = table['_pk'].length; i < numValues; i++) {
            const entry = {} as TableRow<T>;
            for (let j = 0, numArrays = columnNames.length; j < numArrays; j++) {
                entry[columnNames[j]] = table[columnNames[j]][i];
            }
            entries.push(entry);
        }
        return entries;
    };

    const _getRowCount = (): number => {
        return table['_pk'].length;
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
     * Convenience function for returning a table row based on the provided primary key
     * The function will return undefined if the provided index is out of range (e.g., greater than the number of rows in the table)
     * @param pk
     * @returns TableRow | undefined
     */
    function _getRowByPK(pk: PK): TableRow<T> | undefined {
        if (pk < 0) {
            return undefined;
        }
        for (let i = 0, len = _getRowCount(); i < len; i++) {
            if (table._pk[i] === pk) {
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

    const notifyRowSubscribers = (ne: RowNotify, pk: PK) => {
        if (rowSubscribers[pk] && rowSubscribers[pk].length > 0) {
            const subs = rowSubscribers[pk].filter((s) => s.notify.length === 0 || s.notify.includes(ne));
            if (subs.length > 0) {
                const row = _getRowByPK(pk);
                for (let i = 0, len = subs.length; i < len; i++) {
                    subs[i].fn(row);
                }
            }
        }
    };

    const registerRow = (pk: PK, fn: (v: TableRow<T>) => void, notify: RowNotify[]) => {
        if (!rowSubscribers[pk]) {
            rowSubscribers[pk] = [];
        }

        rowSubscribers[pk].push({
            notify,
            fn,
        });
    };

    const unregisterRow = (pk: PK, fn: (v: TableRow<T>) => void) => {
        if (rowSubscribers[pk]) {
            rowSubscribers[pk] = rowSubscribers[pk].filter((d) => d.fn !== fn);
            if (rowSubscribers[pk].length === 0) {
                delete rowSubscribers[pk]; // remove the property entirely if there are no listeners
            }
        }
    };

    const _insertRow = (newRow: T): TableRow<T> | undefined => {
        const newPK = autoPK + 1;
        let entry = {
            _pk: newPK,
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
                entry._pk = newPK; // protect against the user changing the intended primary key
                if (typeof v === 'object') {
                    entry = v;
                }
            }
        }
        ++autoPK; // commit change to primary key
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
                    notifyTableSubscribers('rowInsert');
                }
                entries.push(entry);
            }
        }
        if (batchNotify) {
            notifyTableSubscribers('rowInsert');
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
            _pk: cv._pk, // extra precaution
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
            if (table[k] !== undefined && k !== '_pk') {
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
        if (rowKeys.has('_pk')) {
            logWarning(`attempting to pass value for "_pk" when inserting rows; the "_pk" property is handled automatically and will be ignored when received`);
            rowKeys.delete('_pk');
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
                                    autoPK = 0;
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
                        });
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
        useRow(pk: PK, notify: RowNotify[] = []): TableRow<T> | undefined {
            const [v, setV] = useState<TableRow<T> | undefined>(() => _getRowByPK(pk)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid firing useEffect when the notify object reference changes
            const notifyList = useRef(Array.from(new Set(notify)));
            useEffect(() => {
                const subscribe = (nv: TableRow<T> | undefined) => {
                    setV(nv);
                };
                registerRow(pk, subscribe, notifyList.current);
                setV(_getRowByPK(pk));
                // unregister when component unmounts;
                return () => {
                    unregisterRow(pk, subscribe);
                };
            }, [t, pk]);
            return v;
        },
        insertRow(newRow: T): TableRow<T> | undefined {
            _validateRow(newRow);
            const entry = _insertRow(newRow);
            if (entry) {
                notifyTableSubscribers('rowInsert');
            }
            return entry;
        },
        insertRows(newRows: T[], batchNotify = true): TableRow<T>[] {
            return _insertRows(newRows, batchNotify);
        },
        deleteRow(where: PK | Partial<T> | ((row: TableRow<T>) => boolean)): boolean {
            let i = table._pk.length;
            while (i--) {
                let remove = false;
                switch (typeof where) {
                    case 'number': {
                        if (table._pk[i] === where) {
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
                            notifyRowSubscribers('rowDelete', entry._pk);
                            notifyTableSubscribers('rowDelete');
                        }
                        return deleted;
                    }
                    break; // only delete the first instance
                }
            }
            return false;
        },
        deleteRows(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, batchNotify = true): number {
            let i = table._pk.length;
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
                        if (table._pk[i] === where) {
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
                            notifyRowSubscribers('rowDelete', entry._pk);
                            if (!batchNotify) {
                                notifyTableSubscribers('rowDelete');
                            }
                            numRemoved++;
                        }
                    }
                }
            }
            if (batchNotify) {
                notifyTableSubscribers('rowDelete');
            }
            return numRemoved;
        },
        updateRow(pk: PK, setValue: Partial<T> | ((row: TableRow<T>) => Partial<T>)): TableRow<T> | undefined {
            let idx = -1;
            // find the idx where the pk exists in this table
            for (let i = 0, len = table._pk.length; i < len; i++) {
                if (table._pk[i] === pk) {
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
                    if (updated) {
                        // notify subscribers of changes to row and table
                        notifyRowSubscribers('rowUpdate', currentEntry._pk);
                        notifyTableSubscribers('rowUpdate');
                    }
                    return updated;
                }
            }
            return undefined;
        },
        updateRows(
            setValue: Partial<T> | ((row: TableRow<T>) => Partial<T>),
            where?: Partial<T> | ((row: TableRow<T>) => boolean),
            batch = true,
        ): TableRow<T>[] {
            let idx = table._pk.length;
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
                            notifyRowSubscribers('rowUpdate', currentEntry._pk);
                            if (!batch) {
                                notifyTableSubscribers('rowUpdate');
                            }
                            entries.push(updated);
                        }
                    }
                }
            }
            if (batch) {
                notifyTableSubscribers('rowUpdate');
            }
            return entries;
        },
        getRows(where?: Partial<T> | ((row: TableRow<T>) => boolean)): TableRow<T>[] {
            return _getRows(where);
        },
        getRow(where: PK | Partial<T> | ((row: TableRow<T>) => boolean)): TableRow<T> | undefined {
            const numRows = _getRowCount();
            if (numRows > 0) {
                let idx = -1;
                switch (typeof where) {
                    case 'number': {
                        return _getRowByPK(where);
                    }
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
                        return undefined;
                    }
                }
                if (idx >= 0) {
                    const entry = _getRowByIndex(idx);
                    if (entry) {
                        return entry;
                    }
                    return undefined;
                }
            }
        },
        getRowCount(where?: Partial<T> | ((row: TableRow<T>) => boolean)): number {
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
            return table._pk.length;
        },
        getColumnNames(): (keyof T)[] {
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
                const cols = this.getColumnNames();
                console.log('No rows found');
                console.table(Object.fromEntries(cols.map((d) => [d, []]))); // add an empty array to each column name
                return;
            }

            // transform the rows so the index is the _pk instead of an arbitrary number
            const transformed = rows.reduce((acc, { _pk, ...x }) => {
                acc[_pk] = x;
                return acc;
            }, {} as { [index: number]: Omit<TableRow<T>, '_pk'> });
            console.table(transformed);
        },
        clear(resetIndex = true) {
            _clearTable();
            if (resetIndex) {
                autoPK = 0;
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
    onSet(fn: (newValue: T) => void): void;
    onGet(fn: (value: T) => void): void;
    get(): T;
};

export function CreateSingle<T>(s: T): Single<T> {
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
            if (triggers['onGet']) {
                triggers['onGet'](single);
            }
            return single;
        },
        set(newValue: T): T {
            if (triggers['onSet']) {
                triggers['onSet'](single);
            }
            notifySubscribers(newValue); // we pass the value to save extra function calls within notifySingleSubscribers
            single = newValue;
            return single;
        },
        setFn(fn: (currentValue: T) => T): T {
            if (triggers['onSet']) {
                triggers['onSet'](single);
            }
            const v = fn(single);
            notifySubscribers(v); // we pass the value to save extra function calls within notifySingleSubscribers
            single = v;
            return single;
        },
        onSet(fn: (newValue: T) => void) {
            triggers['onSet'] = fn;
        },
        onGet(fn: (value: T) => void) {
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
