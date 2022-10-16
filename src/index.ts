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

type TableTrigger = 'onDelete' | 'onUpdate' | 'onBeforeInsert' | 'onAfterInsert';
type SingleTrigger = 'onGet' | 'onSet';
type QueueTrigger = 'onInsert' | 'onGet';

type Subscribe<T> = {
    notify: Notify[];
    fn(v: T): void;
};

type SingleSubscribe<T> = (v: T) => void;

type AllowedPrimitives = string | number | Date | boolean | null;

type TableEntry = { [index: string]: AllowedPrimitives } & { _pk: PK };

export interface Store {
    tables?: {
        [index: string]: Table<ReturnType<<T extends TableEntry>() => T>>;
    };
    queues?: {
        [index: string]: Queue<unknown>;
    };
    singles?: {
        [index: string]: Single<unknown>;
    };
}

export type DefinedTable<T> = { [K in keyof T]: T[K][] }; // This is narrowed during CreateTable to ensure it extends TableEntry

// It is yelling because it is true, I need some way of saying the returned value has to have exactly the same properties as the received values

export type Table<T extends TableEntry> = {
    use(where: ((v: T) => boolean) | null, notify?: TableNotify[]): T[];
    useRow(pk: PK, notify?: RowNotify[]): T | undefined;
    insertRow(r: Omit<T, '_pk'>): T | undefined; // undefined if user aborts row insertion through the onBeforeInsert trigger
    insertRows(r: Omit<T, '_pk'>[], batch?: boolean): T[];
    onBeforeInsert(fn: (v: T) => T | void | boolean): void;
    onAfterInsert(fn: (v: T) => void): void;
    deleteRow(where: PK | Partial<Omit<T, '_pk'>> | ((v: T) => boolean)): boolean; // delete the first row that matches the PK, the property values provided, or the function
    deleteRows(where?: Partial<Omit<T, '_pk'>> | ((v: T) => boolean), batch?: boolean): number; // returns the number of deleted rows, 0 if none where deleted. Deletes all rows if no argument is provided
    onDelete(fn: (v: T) => void): void;
    updateRow(pk: PK, newValue: Partial<Omit<T, '_pk'>> | ((v: T) => Partial<Omit<T, '_pk'>>)): T | undefined;
    updateRows(
        setValue: Partial<Omit<T, '_pk'>> | ((v: T) => Partial<Omit<T, '_pk'>>),
        where?: Partial<Omit<T, '_pk'>> | ((v: T) => boolean),
        batch?: boolean,
    ): T[];
    onUpdate(fn: (v: T) => void): void;
    getRows(where?: Partial<Omit<T, '_pk'>> | ((v: T) => boolean)): T[]; // returns all rows that match
    getRow(where: PK | Partial<Omit<T, '_pk'>> | ((v: T) => boolean)): T | undefined; // returns the first row that matches
    getRowCount(where?: Partial<Omit<T, '_pk'>> | ((v: T) => boolean)): number;
};

// This might work out that the triggers just need to send back the value, we don't need to provide the API because the user can do whatever they want as a normal function.
export function CreateTable<T extends TableEntry>(t: DefinedTable<T>): Table<T> {
    const table: DefinedTable<T> = t;
    const columnNames: (keyof T)[] = Object.keys(t);
    const tableSubscribers: Subscribe<T[]>[] = [];
    const rowSubscribers: Record<PK, Subscribe<T | undefined>[]> = {};
    let triggerBeforeInsert: undefined | ((v: T) => T | void | boolean) = undefined;
    let triggerAfterInsert: undefined | ((v: T) => void) = undefined;
    const triggers: { [Property in TableTrigger]?: (v: T) => void } = {};
    let autoPK: PK = 0;

    const _getAllRows = (): T[] => {
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

    const _getRowCount = (): number => {
        return table['_pk'].length;
    };

    /**
     * Convenience function for returning a table row based on the provided index.
     * The function will return undefined if the provided index is out of range (e.g., greater than the number of rows in the table)
     * @param idx
     * @returns TableRow | undefined
     */
    function _getRowByIndex(idx: number): T | undefined {
        if (idx < _getRowCount()) {
            const entry = {} as T;
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
    function _getRowByPK(pk: PK): T | undefined {
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

    const _insertRow = (newRow: Omit<T, '_pk'>): T | undefined => {
        const newPK = autoPK + 1;
        let entry = {
            _pk: newPK,
            ...newRow,
        } as T;

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

    return {
        use(where: ((v: T) => boolean) | null, notify: TableNotify[] = []): T[] {
            const [v, setV] = useState<T[]>(() => (where ? _getAllRows().filter(where) : _getAllRows())); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
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
                const currentTableValues = whereClause.current ? _getAllRows().filter(whereClause.current) : _getAllRows();
                setV(currentTableValues);
                // unregister when component unmounts;
                return () => {
                    unregisterTable(subscribe);
                };
            }, [t]);
            return v;
        },
        useRow(pk: PK, notify: RowNotify[] = []): T | undefined {
            const [v, setV] = useState<T | undefined>(() => _getRowByPK(pk)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid firing useEffect when the notify object reference changes
            const notifyList = useRef(notify);
            useEffect(() => {
                const subscribe = (nv: T | undefined) => {
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
        insertRow(newRow: Omit<T, '_pk'>): T | undefined {
            const entry = _insertRow(newRow);
            if (entry) {
                notifyTableSubscribers('rowInsert');
            }
            return entry;
        },
        insertRows(newRows: Omit<T, '_pk'>[], batch = true): T[] {
            const entries: T[] = [];
            for (let i = 0, len = newRows.length; i < len; i++) {
                const entry = _insertRow(newRows[i]);
                if (entry) {
                    if (!batch) {
                        notifyTableSubscribers('rowInsert');
                    }
                    entries.push(entry);
                }
            }
            if (batch) {
                notifyTableSubscribers('rowInsert');
            }
            return entries;
        },
        deleteRow(where: PK | Partial<Omit<T, '_pk'>> | ((v: T) => boolean)): boolean {
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
                        const pk = table._pk[i];
                        for (const k of columnNames) {
                            table[k].splice(i, 1);
                        }
                        // pass entry to trigger
                        if (triggers['onDelete']) {
                            triggers['onDelete'](entry);
                        }
                        // notify subscribers of changes to row and table
                        notifyRowSubscribers('rowDelete', pk);
                        notifyTableSubscribers('rowDelete');
                        return true;
                    }
                    break; // only delete the first instance
                }
            }
            return false;
        },
        deleteRows(where?: Partial<Omit<T, '_pk'>> | ((v: T) => boolean), batch = true): number {
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
                        const pk = table._pk[i];
                        for (const k of columnNames) {
                            table[k].splice(i, 1);
                        }
                        // pass entry to trigger
                        if (triggers['onDelete']) {
                            triggers['onDelete'](entry);
                        }
                        // notify subscribers of changes to row and table
                        notifyRowSubscribers('rowDelete', pk);
                        if (!batch) {
                            notifyTableSubscribers('rowDelete');
                        }
                        numRemoved++;
                    }
                }
            }
            if (batch) {
                notifyTableSubscribers('rowDelete');
            }
            return numRemoved;
        },
        updateRow(pk: PK, newValue: Partial<Omit<T, '_pk'>> | ((v: T) => Partial<Omit<T, '_pk'>>)): T | undefined {
            let idx = -1;
            // find the idx where the pk exists in this table
            for (let i = 0, len = table._pk.length; i < len; i++) {
                if (table._pk[i] === pk) {
                    idx = i;
                }
            }
            if (idx >= 0) {
                const entry = _getRowByIndex(idx);
                if (entry) {
                    switch (typeof newValue) {
                        case 'object': {
                            for (const k in newValue) {
                                if (!columnNames.includes(k)) {
                                    console.error(`Invalid column provided "${k}"`);
                                    return undefined;
                                }
                            }
                            for (const k in newValue) {
                                if (table[k] !== undefined && k !== '_pk') {
                                    const v = newValue[k];
                                    if (v !== undefined) {
                                        table[k][idx] = v;
                                    }
                                }
                            }
                            break;
                        }
                        case 'function': {
                            const nv = newValue(entry);
                            for (const k in nv) {
                                if (table[k] !== undefined && k !== '_pk') {
                                    const v = nv[k];
                                    if (v !== undefined) {
                                        table[k][idx] = v;
                                    }
                                }
                            }
                            break;
                        }
                    }

                    const updatedEntry = _getRowByIndex(idx);
                    if (updatedEntry) {
                        // pass entry to trigger
                        if (triggers['onUpdate']) {
                            triggers['onUpdate'](entry);
                        }

                        notifyRowSubscribers('rowUpdate', pk);
                        notifyTableSubscribers('rowUpdate');
                    }
                    return updatedEntry;
                }
            }
            return undefined;
        },
        updateRows(
            setValue: Partial<Omit<T, '_pk'>> | ((v: T) => Partial<Omit<T, '_pk'>>),
            where?: Partial<Omit<T, '_pk'>> | ((v: T) => boolean),
            batch = true,
        ): T[] {
            let idx = table._pk.length;
            const entries: T[] = [];
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
                    const entry = _getRowByIndex(idx);
                    if (entry) {
                        switch (typeof setValue) {
                            case 'object': {
                                for (const k in setValue) {
                                    if (!columnNames.includes(k)) {
                                        console.error(`Invalid column provided "${k}"`);
                                        return [];
                                    }
                                }
                                for (const k in setValue) {
                                    if (table[k] !== undefined && k !== '_pk') {
                                        const v = setValue[k];
                                        if (v !== undefined) {
                                            table[k][idx] = v;
                                        }
                                    }
                                }
                                break;
                            }
                            case 'function': {
                                const nv = setValue(entry);
                                for (const k in nv) {
                                    if (table[k] !== undefined && k !== '_pk') {
                                        const v = nv[k];
                                        if (v !== undefined) {
                                            table[k][idx] = v;
                                        }
                                    }
                                }
                                break;
                            }
                        }

                        const updatedEntry = _getRowByIndex(idx);
                        if (updatedEntry) {
                            // pass entry to trigger
                            if (triggers['onUpdate']) {
                                triggers['onUpdate'](entry);
                            }

                            notifyRowSubscribers('rowUpdate', updatedEntry._pk);
                            if (!batch) {
                                notifyTableSubscribers('rowUpdate');
                            }
                            entries.push(updatedEntry);
                        }
                    }
                }
            }
            if (batch) {
                notifyTableSubscribers('rowUpdate');
            }
            return entries;
        },
        getRows(where?: Partial<Omit<T, '_pk'>> | ((v: T) => boolean)): T[] {
            const numRows = _getRowCount();
            if (numRows > 0) {
                switch (typeof where) {
                    case 'undefined': {
                        return _getAllRows();
                    }
                    case 'function': {
                        const entries: T[] = [];
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
        getRow(where: PK | Partial<Omit<T, '_pk'>> | ((v: T) => boolean)): T | undefined {
            const numRows = _getRowCount();
            if (numRows > 0) {
                let idx = -1;
                switch (typeof where) {
                    case 'number': {
                        return _getRowByPK(where);
                    }
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
                    const entry = _getRowByIndex(idx);
                    if (entry) {
                        return entry;
                    }
                    return undefined;
                }
            }
        },
        getRowCount(where?: Partial<Omit<T, '_pk'>> | ((v: T) => boolean)): number {
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
                        const entry = {} as T;
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
        onBeforeInsert(fn: (v: T) => T | boolean | void) {
            triggerBeforeInsert = fn;
        },
        onAfterInsert(fn: (v: T) => void) {
            triggerAfterInsert = fn;
        },
        onDelete(fn: (v: T) => void) {
            triggers['onDelete'] = fn;
        },
        onUpdate(fn: (v: T) => void) {
            triggers['onUpdate'] = fn;
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
