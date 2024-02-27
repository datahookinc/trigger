var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import { useEffect, useRef, useState } from 'react';
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
// if instantiated correctly, it returns the number of initialized elements for seeding the autoAUTOID for the table
function _checkTable(t) {
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
            throw newError(`invalid initial arguments when creating table; column "${k}" has improper length of ${t[k].length}, which does not match the length of the other columns provided`);
        }
    }
    return nInitialLength;
}
// This might work out that the triggers just need to send back the value, we don't need to provide the API because the user can do whatever they want as a normal function.
export function CreateTable(t) {
    // turn t into an object if provided as an array of column names; will implicitly remove duplicate column names
    if (t instanceof Array) {
        t = t.reduce((acc, cur) => {
            acc[cur] = [];
            return acc;
        }, {});
    }
    const nInitialLength = _checkTable(t);
    // setup the autoID (accounting for any initial values)
    let autoID = 0;
    const initialAUTOID = [];
    for (let i = 0; i < nInitialLength; i++) {
        initialAUTOID[i] = ++autoID;
    }
    const initialValues = Object.assign(Object.assign({}, t), { _id: initialAUTOID }); // put AUTOID last to override it if the user passes it in erroneously
    const table = initialValues; // manually add the "_id" so the user does not need to
    const originalColumnNames = Object.keys(t); // the user provided column names
    const columnNames = Object.keys(initialValues); // the user provided column names + "_id"
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
        for (let i = 0, numValues = table['_id'].length; i < numValues; i++) {
            const entry = {};
            for (let j = 0, numArrays = columnNames.length; j < numArrays; j++) {
                entry[columnNames[j]] = table[columnNames[j]][i];
            }
            entries.push(entry);
        }
        return entries;
    };
    const _getRowCount = () => {
        return table['_id'].length;
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
     * Convenience function for returning a table row based on the provided autoID
     * The function will return undefined if the provided index is out of range (e.g., greater than the number of rows in the table)
     * @param AUTOID
     * @returns TableRow | undefined
     */
    function _getRowByAUTOID(AUTOID) {
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
    const notifyRowSubscribers = (ne, AUTOID) => {
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
    const registerRow = (AUTOID, fn, notify) => {
        if (!rowSubscribers[AUTOID]) {
            rowSubscribers[AUTOID] = [];
        }
        rowSubscribers[AUTOID].push({
            notify,
            fn,
        });
    };
    const unregisterRow = (AUTOID, fn) => {
        if (rowSubscribers[AUTOID]) {
            rowSubscribers[AUTOID] = rowSubscribers[AUTOID].filter((d) => d.fn !== fn);
            if (rowSubscribers[AUTOID].length === 0) {
                delete rowSubscribers[AUTOID]; // remove the property entirely if there are no listeners
            }
        }
    };
    const _insertRow = (newRow) => {
        const newAUTOID = autoID + 1;
        let entry = Object.assign({ _id: newAUTOID }, newRow);
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
    const _insertRows = (newRows, batchNotify = true) => {
        const entries = [];
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
        const merged = Object.assign(Object.assign(Object.assign({}, cv), nv), { _id: cv._id });
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
    const _validateRow = (row) => {
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
    const _getRows = (where) => {
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
                    if (where === null) {
                        return _getAllRows();
                    }
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
    };
    const _clearTable = () => {
        for (const k of columnNames) {
            table[k] = [];
        }
    };
    return {
        use(where = null, notify = []) {
            const [v, setV] = useState(() => (where ? _getAllRows().filter(where) : _getAllRows())); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid exhaustive-deps warning, and to avoid calling useEffect everytime v changes
            const hasChanged = useRef((newValues) => tableHasChanged(v, newValues));
            const notifyList = useRef(Array.from(new Set(notify)));
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
        useLoadData(queryFn, options) {
            const ops = Object.assign({ refreshOn: [], refreshMode: 'replace', resetIndex: false, notify: [], fetchOnMount: true }, options);
            const isQuerying = useRef(false);
            const [status, setStatus] = useState('idle');
            const [data, setData] = useState(ops.filter ? _getAllRows().filter(ops.filter) : _getAllRows());
            const [error, setError] = useState(null);
            // NOTE: this is required to avoid exhaustive-deps warning, and to avoid calling useEffect everytime v changes
            const hasChanged = useRef((newValues) => tableHasChanged(data, newValues));
            const notifyList = useRef(Array.from(new Set(ops.notify)));
            const whereClause = useRef(ops.filter);
            hasChanged.current = (newValues) => tableHasChanged(data, newValues);
            // responsible for loading data into the table
            useEffect(() => {
                var _a;
                if (!isQuerying.current && ops.fetchOnMount) {
                    isQuerying.current = true;
                    setStatus('loading');
                    (_a = queryFn()) === null || _a === void 0 ? void 0 : _a.then((d) => {
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
                    }).catch((err) => {
                        setStatus('error');
                        setData([]);
                        setError(String(err));
                    }).finally(() => isQuerying.current = false);
                }
            }, ops.refreshOn);
            // similar to use(); responsible for updating the component when there are changes to the table
            useEffect(() => {
                const subscribe = (nv) => {
                    if (whereClause.current) {
                        // compare to see if changes effect rows this component is hooking into
                        const filtered = nv.filter(whereClause.current);
                        if (hasChanged.current(filtered)) {
                            setData(nv.filter(whereClause.current));
                        }
                    }
                    else {
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
        useById(AUTOID, notify = []) {
            const [v, setV] = useState(() => _getRowByAUTOID(AUTOID)); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            // NOTE: this is required to avoid firing useEffect when the notify object reference changes
            const notifyList = useRef(Array.from(new Set(notify)));
            useEffect(() => {
                const subscribe = (nv) => {
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
        insertOne(newRow) {
            _validateRow(newRow);
            const entry = _insertRow(newRow);
            if (entry) {
                notifyTableSubscribers('onInsert');
            }
            return entry;
        },
        insertMany(newRows, batchNotify = true) {
            return _insertRows(newRows, batchNotify);
        },
        deleteById(_id) {
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
        deleteOne(where) {
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
        deleteMany(where, batchNotify = true) {
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
        updateById(AUTOID, setValue) {
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
                    let updated = undefined;
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
                        notifyRowSubscribers('onUpdate', currentEntry._id);
                        notifyTableSubscribers('onUpdate');
                    }
                    return updated;
                }
            }
            return undefined;
        },
        updateMany(setValue, where, batch = true) {
            let idx = table._id.length;
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
                            notifyRowSubscribers('onUpdate', currentEntry._id);
                            if (!batch) {
                                notifyTableSubscribers('onUpdate');
                            }
                            entries.push(updated);
                        }
                    }
                }
            }
            if (batch) {
                notifyTableSubscribers('onUpdate');
            }
            return entries;
        },
        find(where) {
            return _getRows(where);
        },
        findById(_id) {
            return _getRowByAUTOID(_id);
        },
        findOne(where) {
            const numRows = _getRowCount();
            let idx = -1;
            if (numRows > 0) {
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
        count(where) {
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
            return table._id.length;
        },
        columnNames() {
            return columnNames.sort();
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
        print(where, n = 50) {
            let rows = _getRows(where);
            rows = n == -1 ? rows : rows.slice(0, n);
            if (rows.length === 0) {
                const cols = this.columnNames();
                console.log('No rows found');
                console.table(Object.fromEntries(cols.map((d) => [d, []]))); // add an empty array to each column name
                return;
            }
            // transform the rows so the index is the _id instead of an arbitrary number
            const transformed = rows.reduce((acc, _a) => {
                var { _id } = _a, x = __rest(_a, ["_id"]);
                acc[_id] = x;
                return acc;
            }, {});
            console.table(transformed);
        },
        clear(resetIndex = true) {
            _clearTable();
            if (resetIndex) {
                autoID = 0;
            }
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
            return item === null || item === void 0 ? void 0 : item.item;
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
    let triggerOnSet = undefined;
    let triggerOnGet = undefined;
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
        use(where) {
            const [v, setV] = useState(() => single); // initial value is set once registered to avoid race condition between call to useState and call to useEffect
            const whereClause = useRef(where);
            useEffect(() => {
                const subscribe = (nv) => {
                    // check that the state should be updated
                    if (whereClause.current) {
                        if (whereClause.current(nv)) {
                            setV(nv);
                        }
                    }
                    else {
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
        get() {
            // pass entry to trigger
            if (triggerOnGet) {
                triggerOnGet(single);
            }
            return single;
        },
        set(newValue) {
            if (triggerOnSet) {
                triggerOnSet(single, newValue);
            }
            notifySubscribers(newValue); // we pass the value to save extra function calls within notifySingleSubscribers
            single = newValue;
            return single;
        },
        setFn(fn) {
            const v = fn(single);
            notifySubscribers(v); // we pass the value to save extra function calls within notifySingleSubscribers
            if (triggerOnSet) {
                triggerOnSet(single, v);
            }
            single = v;
            return single;
        },
        onSet(fn) {
            triggerOnSet = fn;
        },
        onGet(fn) {
            triggerOnGet = fn;
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
