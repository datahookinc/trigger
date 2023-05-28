import { useState, useRef, useEffect } from 'react';
const errorStyling = `
    background-color: black;
    padding: 8px;
    font-family: Roboto, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
`;
function logError(error) {
    console.log(`%c⚡Error in @datahook/trigger: %c${error}`, `${errorStyling} border-left: 1px solid yellow; color: red; font-weight: bold`, `${errorStyling} color: white`);
}
function logWarning(error) {
    console.log(`%c⚡Warning in @datahook/trigger: %c${error}`, `${errorStyling} border-left: 1px solid yellow; color: yellow; font-weight: bold`, `${errorStyling} color: white`);
}
function newError(error) {
    return new Error(`⚡Error in @datahook/trigger: ${error}`);
}
function logAndThrowError(error) {
    logError(error);
    throw newError(error);
}
// _checkTable throws an error if the table is not instantiated correctly.
// if instantiated correctly, it returns the number of initialized elements for seeding the autoPK for the table
function _checkTable(t) {
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
            throw newError(`invalid initial arguments when creating table; column "${k}" has improper length of ${t[k].length}, which does not match the length of the other columns provided`);
        }
    }
    return nInitialLength;
}
// This might work out that the triggers just need to send back the value, we don't need to provide the API because the user can do whatever they want as a normal function.
export function CreateTable(t) {
    const nInitialLength = _checkTable(t);
    // setup the primary keys (accounting for any initial values)
    let autoPK = 0;
    const initialPK = [];
    for (let i = 0; i < nInitialLength; i++) {
        initialPK[i] = ++autoPK;
    }
    const initialValues = Object.assign(Object.assign({}, t), { _pk: initialPK }); // put PK last to override it if the user passes it in erroneously
    const table = initialValues; // manually add the "_pk" so the user does not need to
    const originalColumnNames = Object.keys(t); // the user provided column names
    const columnNames = Object.keys(initialValues); // the user provided column names + "_pk"
    const tableSubscribers = [];
    const rowSubscribers = {};
    let triggerBeforeInsert = undefined;
    let triggerAfterInsert = undefined;
    let triggerBeforeDelete = undefined;
    let triggerAfterDelete = undefined;
    let triggerBeforeUpdate = undefined;
    let triggerAfterUpdate = undefined;
    const _getAllRows = () => {
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
    const _getRowCount = () => {
        return table['_pk'].length;
    };
    /**
     * Convenience function for returning a table row based on the provided index.
     * The function will return undefined if the provided index is out of range (e.g., greater than the number of rows in the table)
     * @param idx
     * @returns TableRow | undefined
     */
    function _getRowByIndex(idx) {
        if (idx < _getRowCount()) {
            const entry = {};
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
    function _getRowByPK(pk) {
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
            const rows = _getAllRows(); // PERFORMANCE: One of the downsides is we end-up creating a lot of objects each time the table changes
            for (let i = 0, len = subs.length; i < len; i++) {
                subs[i].fn(rows);
            }
        }
    };
    const notifyRowSubscribers = (ne, pk) => {
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
    const _insertRow = (newRow) => {
        const newPK = autoPK + 1;
        let entry = Object.assign({ _pk: newPK }, newRow);
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
    const _deleteRow = (idx, entry) => {
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
    const _updateRow = (idx, cv, nv) => {
        // merge the two values
        const merged = Object.assign(Object.assign(Object.assign({}, cv), nv), { _pk: cv._pk });
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
    const _validateRow = (row) => {
        const keys = Object.keys(row);
        keys.forEach((k) => {
            if (k == '_pk') {
                logWarning(`attempting to pass value for "_pk" when inserting rows; the "_pk" property is handled automatically and will be ignored when received`);
            }
            if (!originalColumnNames.includes(k)) {
                logAndThrowError(`attempting to insert value into column "${k}", which does not exist in table`);
            }
        });
        originalColumnNames.forEach((k) => {
            if (!keys.includes(k)) {
                logAndThrowError(`did not provide column "${k}" when attempting to insert row into table`);
            }
        });
        return true;
    };
    return {
        use(where, notify = []) {
            const [v, setV] = useState(() => (where ? _getAllRows().filter(where) : _getAllRows())); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
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
                const currentTableValues = whereClause.current ? _getAllRows().filter(whereClause.current) : _getAllRows();
                setV(currentTableValues);
                // unregister when component unmounts;
                return () => {
                    unregisterTable(subscribe);
                };
            }, [t]);
            return v;
        },
        useRow(pk, notify = []) {
            const [v, setV] = useState(() => _getRowByPK(pk)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid firing useEffect when the notify object reference changes
            const notifyList = useRef(notify);
            useEffect(() => {
                const subscribe = (nv) => {
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
        insertRow(newRow) {
            _validateRow(newRow);
            const entry = _insertRow(newRow);
            if (entry) {
                notifyTableSubscribers('rowInsert');
            }
            return entry;
        },
        insertRows(newRows, batchNotify = true) {
            const entries = [];
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
        },
        deleteRow(where) {
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
        deleteRows(where, batchNotify = true) {
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
        updateRow(pk, newValue) {
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
                    let updated = undefined;
                    switch (typeof newValue) {
                        case 'object': {
                            for (const k in newValue) {
                                if (!columnNames.includes(k)) {
                                    logError(`Invalid column provided "${k}"`);
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
        updateRows(setValue, where, batch = true) {
            let idx = table._pk.length;
            const entries = [];
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
                        let updated = undefined;
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
        getRows(where) {
            const numRows = _getRowCount();
            if (numRows > 0) {
                switch (typeof where) {
                    case 'undefined': {
                        return _getAllRows();
                    }
                    case 'function': {
                        const entries = [];
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
        getRow(where) {
            const numRows = _getRowCount();
            if (numRows > 0) {
                let idx = -1;
                switch (typeof where) {
                    case 'number': {
                        return _getRowByPK(where);
                    }
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
                    const entry = _getRowByIndex(idx);
                    if (entry) {
                        return entry;
                    }
                    return undefined;
                }
            }
        },
        getRowCount(where) {
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
                        const entry = {};
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
        getColumnNames() {
            return columnNames;
        },
        onBeforeInsert(fn) {
            triggerBeforeInsert = fn;
        },
        onAfterInsert(fn) {
            triggerAfterInsert = fn;
        },
        onBeforeDelete(fn) {
            triggerBeforeDelete = fn;
        },
        onAfterDelete(fn) {
            triggerAfterDelete = fn;
        },
        onBeforeUpdate(fn) {
            triggerBeforeUpdate = fn;
        },
        onAfterUpdate(fn) {
            triggerAfterUpdate = fn;
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
        set(newValue) {
            if (triggers['onSet']) {
                triggers['onSet'](single);
            }
            notifySubscribers(newValue); // we pass the value to save extra function calls within notifySingleSubscribers
            single = newValue;
            return single;
        },
        setFn(fn) {
            if (triggers['onSet']) {
                triggers['onSet'](single);
            }
            const v = fn(single);
            notifySubscribers(v); // we pass the value to save extra function calls within notifySingleSubscribers
            single = v;
            return single;
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
export function extract(t) {
    const extracted = {};
    if (t.tables) {
        extracted.tables = t.tables;
    }
    if (t.singles) {
        extracted.singles = t.singles;
    }
    if (t.queues) {
        extracted.queues = t.queues;
    }
    return extracted;
}
