import { useState, useRef, useEffect } from 'react';
// This might work out that the triggers just need to send back the value, we don't need to provide the API because the user can do whatever they want as a normal function.
export function CreateTable(t) {
    const table = t;
    const columnNames = Object.keys(t);
    const tableSubscribers = [];
    const rowSubscribers = {};
    const triggers = {};
    let autoPK = 0;
    const getTable = () => {
        const entries = [];
        for (let i = 0, numValues = table['_pk'].length; i < numValues; i++) {
            const entry = {};
            for (let j = 0, numArrays = columnNames.length; j < numArrays; j++) {
                entry[columnNames[j]] = table[columnNames[j]][i];
            }
            entries.push(entry);
        }
        return entries;
    };
    const getTableRowCount = () => {
        return table['_pk'].length;
    };
    /**
     * Convenience function for returning a table row based on the provided table and index.
     * The function will return undefined if the provided index is out of range (e.g., greater than the number of rows in the table)
     * @param idx
     * @returns TableRow | undefined
     */
    function getTableRowByIndex(idx) {
        if (idx < getTableRowCount()) {
            const entry = {};
            for (const k of columnNames) {
                entry[k] = table[k][idx];
            }
            return entry;
        }
        return undefined;
    }
    const getTableRow = (pk) => {
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
    const tableHasChanged = (oldValues, newValues) => {
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
    const registerTable = (fn, notify) => {
        tableSubscribers.push({
            notify,
            fn,
        });
    };
    const unregisterTable = (fn) => {
        tableSubscribers.filter((d) => d.fn !== fn);
    };
    const notifyTableSubscribers = (ne) => {
        const subs = tableSubscribers.filter((s) => s.notify.length === 0 || s.notify.includes(ne));
        if (subs.length > 0) {
            const rows = getTable(); // PERFORMANCE: One of the downsides is we end-up creating a lot of objects each time the table changes
            for (let i = 0, len = subs.length; i < len; i++) {
                subs[i].fn(rows);
            }
        }
    };
    const notifyRowSubscribers = (ne, pk) => {
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
    const registerRow = (pk, fn, notify) => {
        if (!rowSubscribers[pk]) {
            rowSubscribers[pk] = [];
        }
        rowSubscribers[pk].push({
            notify,
            fn,
        });
    };
    const unregisterRow = (pk, fn) => {
        if (rowSubscribers[pk]) {
            rowSubscribers[pk] = rowSubscribers[pk].filter((d) => d.fn !== fn);
            if (rowSubscribers[pk].length === 0) {
                delete rowSubscribers[pk]; // remove the property entirely if there are no listeners
            }
        }
    };
    return {
        useTable(where, notify = []) {
            const [v, setV] = useState(() => (where ? getTable().filter(where) : getTable())); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid exhaustive-deps warning, and to avoid calling useEffect everytime v changes
            const hasChanged = useRef((newValues) => tableHasChanged(v, newValues));
            const notifyList = useRef(notify);
            const whereClause = useRef(where);
            hasChanged.current = (newValues) => tableHasChanged(v, newValues);
            useEffect(() => {
                const subscribe = (nv) => {
                    if (whereClause.current) {
                        // compare to see if changes effect rows this component is hooking into
                        const filtered = nv.filter(whereClause.current);
                        if (hasChanged.current(filtered)) {
                            setV(nv.filter(whereClause.current));
                        }
                    }
                    else {
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
        useTableRow(pk, notify = []) {
            const [v, setV] = useState(() => getTableRow(pk)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid firing useEffect when the notify object reference changes
            const notifyList = useRef(notify);
            useEffect(() => {
                const subscribe = (nv) => {
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
        insertTableRow(newRow) {
            for (const k in newRow) {
                table[k].push(newRow[k]);
            }
            table['_pk'].push(++autoPK);
            // add the primary key and send it back
            const entry = Object.assign({ _pk: autoPK }, newRow);
            // pass entry to trigger
            if (triggers['onInsert']) {
                triggers['onInsert'](entry);
            }
            notifyTableSubscribers('rowInsert');
            // return the entry to the calling function
            return entry;
        },
        deleteTableRow(pk) {
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
        updateTableRow(pk, valueMap) {
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
        findTableRows(where) {
            const numRows = getTableRowCount();
            if (numRows > 0) {
                if (typeof where === 'function') {
                    const entries = [];
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
                    }
                    else {
                        // make sure the requested columns exist in the table; if they don't all exist, return undefined
                        for (const k of keys) {
                            if (!columnNames.includes(k)) {
                                return [];
                            }
                        }
                        const entries = [];
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
        findTableRow(where) {
            const numRows = getTableRowCount();
            if (numRows > 0) {
                let idx = -1;
                switch (typeof where) {
                    case 'function': {
                        // loop through the rows until we find a matching index, returns the first match if any
                        const entry = {};
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
                        }
                        else {
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
        onInsert(fn) {
            triggers['onInsert'] = fn;
        },
    };
}
/** NewTriggerQueue is a wrapper for creating a new trigger queue that will be managed by the store
 *
 * @returns TriggerQueue<T>
 */
export function CreateQueue() {
    const q = [];
    const triggers = {};
    return {
        insert(item, cb) {
            q.push({ item, cb });
            // pass entry to trigger
            if (triggers['onInsert']) {
                triggers['onInsert'](item);
            }
            return true;
        },
        get() {
            const item = q.shift();
            if (item) {
                // pass entry to trigger
                if (triggers['onGet']) {
                    triggers['onGet'](item.item);
                }
            }
            return item;
        },
        size() {
            return q.length;
        },
        onInsert(fn) {
            triggers['onInsert'] = fn;
        },
        onGet(fn) {
            triggers['onGet'] = fn;
        },
    };
}
export function CreateSingle(s) {
    let single = s;
    let subscribers = [];
    const triggers = {};
    // Note: singles always fire when they are set
    const registerSingle = (fn) => {
        subscribers.push(fn);
    };
    // It seems like it might be here? My unregisters aren't working properly?
    const unregisterSingle = (fn) => {
        subscribers = subscribers.filter((d) => d !== fn);
    };
    const notifySubscribers = (v) => {
        for (let i = 0, len = subscribers.length; i < len; i++) {
            subscribers[i](v);
        }
    };
    return {
        use() {
            const [v, setV] = useState(() => single); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            useEffect(() => {
                const subscribe = (nv) => {
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
        get() {
            // pass entry to trigger
            if (triggers['onGet']) {
                triggers['onGet'](single);
            }
            return single;
        },
        set(v) {
            if (triggers['onSet']) {
                triggers['onSet'](single);
            }
            notifySubscribers(v); // we pass the value to save extra function calls within notifySingleSubscribers
            single = v;
            return true;
        },
        onSet(fn) {
            triggers['onSet'] = fn;
        },
        onGet(fn) {
            triggers['onGet'] = fn;
        },
    };
}
export function extractTables(t) {
    return t;
}
export function extractQueues(t) {
    return t;
}
export function extractSingles(t) {
    return t;
}
