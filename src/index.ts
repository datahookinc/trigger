import { useState, useRef, useEffect } from 'react';

const errorStyling = `
    background-color: black;
    padding: 8px;
    font-family: Roboto, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
`;

function logError(error: string) {
    console.log(`%c⚡Error in @datahook/trigger: %c${error}`, `${errorStyling} border-left: 1px solid yellow; color: red; font-weight: bold`, `${errorStyling} color: white`); 
}

function newError(error: string): Error {
    return new Error(`⚡Error in @datahook/trigger: ${error}`);
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

// UserEntry is what the user provides
type UserEntry = { [index: string]: AllowedPrimitives }; // & { _pk?: never}; TODO: ensure user does not try to pass-in _pk property during initialization

// TableEntry is the UserEntry decorated with the _pk
type TableEntry<T> = { [K in keyof T]: T[K] } & { _pk: number };

export interface Store {
    tables?: {
        [index: string]: Table<ReturnType<<T extends UserEntry>() => T>>;
    };
    queues?: {
        [index: string]: Queue<unknown>;
    };
    singles?: {
        [index: string]: Single<unknown>;
    };
}

export type DefinedTable<T> = { [K in keyof T]: T[K][] }; // This is narrowed during CreateTable to ensure it extends TableEntry

export type Table<T extends UserEntry> = {
    use(where: ((v: TableEntry<T>) => boolean) | null, notify?: TableNotify[]): TableEntry<T>[];
    useRow(pk: PK, notify?: RowNotify[]): TableEntry<T> | undefined;
    insertRow(r: T): TableEntry<T> | undefined; // undefined if user aborts row insertion through the onBeforeInsert trigger
    insertRows(r: T[], batchNotify?: boolean): TableEntry<T>[];
    onBeforeInsert(fn: (v: TableEntry<T>) => TableEntry<T> | void | boolean): void;
    onAfterInsert(fn: (v: TableEntry<T>) => void): void;
    deleteRow(where: PK | Partial<T> | ((v: TableEntry<T>) => boolean)): boolean; // delete the first row that matches the PK, the property values provided, or the function
    deleteRows(where?: Partial<T> | ((v: TableEntry<T>) => boolean), batchNotify?: boolean): number; // returns the number of deleted rows, 0 if none where deleted. Deletes all rows if no argument is provided
    onBeforeDelete(fn: (v: TableEntry<T>) => boolean | void): void;
    onAfterDelete(fn: (v: TableEntry<T>) => void): void;
    updateRow(pk: PK, newValue: Partial<T> | ((v: TableEntry<T>) => Partial<T>)): TableEntry<T> | undefined;
    updateRows(
        setValue: Partial<T> | ((v: TableEntry<T>) => Partial<T>),
        where?: Partial<T> | ((v: TableEntry<T>) => boolean),
        batchNotify?: boolean,
    ): TableEntry<T>[];
    onBeforeUpdate(fn: (currentValue: TableEntry<T>, newValue: TableEntry<T>) => TableEntry<T> | void | boolean): void;
    onAfterUpdate(fn: (previousValue: TableEntry<T>, newValue: TableEntry<T>) => void): void;
    getRows(where?: Partial<T> | ((v: TableEntry<T>) => boolean)): TableEntry<T>[]; // returns all rows that match
    getRow(where: PK | Partial<T> | ((v: TableEntry<T>) => boolean)): TableEntry<T> | undefined; // returns the first row that matches
    getRowCount(where?: Partial<T> | ((v: TableEntry<T>) => boolean)): number;
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
export function CreateTable<T extends UserEntry>(t: DefinedTable<T>): Table<TableEntry<T>> {
    const nInitialLength = _checkTable(t);
    // setup the primary keys (accounting for any initial values)
    let autoPK: PK = 0;
    const initialPK: PK[] = [];
    for (let i = 0; i < nInitialLength; i++) {
        initialPK[i] = ++autoPK;
    }
    const initialValues = { ...t, _pk: initialPK } as DefinedTable<TableEntry<T>>; // put PK last to override it if the user passes it in erroneously
    const table: DefinedTable<TableEntry<T>> = initialValues; // manually add the "_pk" so the user does not need to
    const columnNames: (keyof T)[] = Object.keys(initialValues); // TODO: this is technically wrong because it does not include "_pk" as a column name in the type
    const tableSubscribers: Subscribe<TableEntry<T>[]>[] = [];
    const rowSubscribers: Record<PK, Subscribe<TableEntry<T> | undefined>[]> = {};
    let triggerBeforeInsert: undefined | ((v: TableEntry<T>) => TableEntry<T> | void | boolean) = undefined;
    let triggerAfterInsert: undefined | ((v: TableEntry<T>) => void) = undefined;
    let triggerBeforeDelete: undefined | ((v: TableEntry<T>) => boolean | void) = undefined;
    let triggerAfterDelete: undefined | ((v: TableEntry<T>) => void) = undefined;
    let triggerBeforeUpdate: undefined | ((cv: TableEntry<T>, nv: TableEntry<T>) => TableEntry<T> | void | boolean) = undefined;
    let triggerAfterUpdate: undefined | ((pv: TableEntry<T>, nv: TableEntry<T>) => void) = undefined;

    const _getAllRows = (): TableEntry<T>[] => {
        const entries: TableEntry<T>[] = [];
        for (let i = 0, numValues = table['_pk'].length; i < numValues; i++) {
            const entry = {} as TableEntry<T>;
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
    function _getRowByIndex(idx: number): TableEntry<T> | undefined {
        if (idx < _getRowCount()) {
            const entry = {} as TableEntry<T>;
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
    function _getRowByPK(pk: PK): TableEntry<T> | undefined {
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

    const registerTable = (fn: (v: TableEntry<T>[]) => void, notify: TableNotify[]) => {
        tableSubscribers.push({
            notify,
            fn,
        });
    };

    const unregisterTable = (fn: (v: TableEntry<T>[]) => void) => {
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

    const registerRow = (pk: PK, fn: (v: TableEntry<T>) => void, notify: RowNotify[]) => {
        if (!rowSubscribers[pk]) {
            rowSubscribers[pk] = [];
        }

        rowSubscribers[pk].push({
            notify,
            fn,
        });
    };

    const unregisterRow = (pk: PK, fn: (v: TableEntry<T>) => void) => {
        if (rowSubscribers[pk]) {
            rowSubscribers[pk] = rowSubscribers[pk].filter((d) => d.fn !== fn);
            if (rowSubscribers[pk].length === 0) {
                delete rowSubscribers[pk]; // remove the property entirely if there are no listeners
            }
        }
    };

    const _insertRow = (newRow: T): TableEntry<T> | undefined => {
        const newPK = autoPK + 1;
        let entry = {
            _pk: newPK,
            ...newRow,
        } as TableEntry<T>;

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
            // if the user returns nothing, or true, then the entry is considered correct for insertion
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

    const _deleteRow = (idx: number, entry: TableEntry<T>): boolean => {
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

    const _updateRow = (idx: number, cv: TableEntry<T>, nv: Partial<T>): TableEntry<T> | undefined => {
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

    return {
        use(where: ((v: TableEntry<T>) => boolean) | null, notify: TableNotify[] = []): TableEntry<T>[] {
            const [v, setV] = useState<TableEntry<T>[]>(() => (where ? _getAllRows().filter(where) : _getAllRows())); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid exhaustive-deps warning, and to avoid calling useEffect everytime v changes
            const hasChanged = useRef((newValues: TableEntry<T>[]) => tableHasChanged(v, newValues));
            const notifyList = useRef(notify);
            const whereClause = useRef(where);
            hasChanged.current = (newValues: TableEntry<T>[]) => tableHasChanged(v, newValues);

            useEffect(() => {
                const subscribe = (nv: TableEntry<T>[]) => {
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
        useRow(pk: PK, notify: RowNotify[] = []): TableEntry<T> | undefined {
            const [v, setV] = useState<TableEntry<T> | undefined>(() => _getRowByPK(pk)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid firing useEffect when the notify object reference changes
            const notifyList = useRef(notify);
            useEffect(() => {
                const subscribe = (nv: TableEntry<T> | undefined) => {
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
        insertRow(newRow: T): TableEntry<T> | undefined {
            const entry = _insertRow(newRow);
            if (entry) {
                notifyTableSubscribers('rowInsert');
            }
            return entry;
        },
        insertRows(newRows: T[], batchNotify = true): TableEntry<T>[] {
            const entries: TableEntry<T>[] = [];
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
        },
        deleteRow(where: PK | Partial<T> | ((v: TableEntry<T>) => boolean)): boolean {
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
        deleteRows(where?: Partial<T> | ((v: TableEntry<T>) => boolean), batchNotify = true): number {
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
        updateRow(pk: PK, newValue: Partial<T> | ((v: TableEntry<T>) => Partial<T>)): TableEntry<T> | undefined {
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
                    let updated: TableEntry<T> | undefined = undefined;
                    switch (typeof newValue) {
                        case 'object': {
                            for (const k in newValue) {
                                if (!columnNames.includes(k)) {
                                    logError(`Invalid column provided "${k}"`)
                                    return undefined;
                                }
                            }
                            updated = _updateRow(idx, currentEntry, newValue);
                            break;
                        }
                        case 'function': {
                            const nv = newValue(currentEntry);
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
            setValue: Partial<T> | ((v: TableEntry<T>) => Partial<T>),
            where?: Partial<T> | ((v: TableEntry<T>) => boolean),
            batch = true,
        ): TableEntry<T>[] {
            let idx = table._pk.length;
            const entries: TableEntry<T>[] = [];
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
                        let updated: TableEntry<T> | undefined = undefined;
                        switch (typeof setValue) {
                            case 'object': {
                                for (const k in setValue) {
                                    if (!columnNames.includes(k)) {
                                        logError(`Invalid column provided "${k}"`)
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
        getRows(where?: Partial<T> | ((v: TableEntry<T>) => boolean)): TableEntry<T>[] {
            const numRows = _getRowCount();
            if (numRows > 0) {
                switch (typeof where) {
                    case 'undefined': {
                        return _getAllRows();
                    }
                    case 'function': {
                        const entries: TableEntry<T>[] = [];
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
                            const entries: TableEntry<T>[] = [];
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
        },
        getRow(where: PK | Partial<T> | ((v: TableEntry<T>) => boolean)): TableEntry<T> | undefined {
            const numRows = _getRowCount();
            if (numRows > 0) {
                let idx = -1;
                switch (typeof where) {
                    case 'number': {
                        return _getRowByPK(where);
                    }
                    case 'function': {
                        // loop through the rows until we find a matching index, returns the first match if any
                        const entry = {} as TableEntry<T>;
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
        getRowCount(where?: Partial<T> | ((v: TableEntry<T>) => boolean)): number {
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
                        const entry = {} as TableEntry<T>;
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
        onBeforeInsert(fn: (v: TableEntry<T>) => TableEntry<T> | boolean | void) {
            triggerBeforeInsert = fn;
        },
        onAfterInsert(fn: (v: TableEntry<T>) => void) {
            triggerAfterInsert = fn;
        },
        onBeforeDelete(fn: (v: TableEntry<T>) => boolean | void) {
            triggerBeforeDelete = fn;
        },
        onAfterDelete(fn: (v: TableEntry<T>) => void) {
            triggerAfterDelete = fn;
        },
        onBeforeUpdate(fn: (currentValue: TableEntry<T>, newValue: TableEntry<T>) => boolean | void) {
            triggerBeforeUpdate = fn;
        },
        onAfterUpdate(fn: (previousValue: TableEntry<T>, newValue: TableEntry<T>) => void) {
            triggerAfterUpdate = fn;
        },
    };
}

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
        get(): QueueItem<T> | undefined {
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

export type Single<T> = {
    use(): T;
    set(v: T): boolean;
    onSet(fn: (v: T) => void): void;
    onGet(fn: (v: T) => void): void;
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
