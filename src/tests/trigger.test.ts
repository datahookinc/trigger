import { renderHook, act } from '@testing-library/react';
import CreateStore, { Store } from '../trigger/trigger';

export type ModelEntry = {
    _pk: number;
    uuid: string;
    name: string;
    description: string;
}

type MyStore = Store & {
    tables: {
        models: {
            _pk: Array<ModelEntry["_pk"]>,
            uuid: Array<ModelEntry["uuid"]>,
            name: Array<ModelEntry["uuid"]>,
            description: Array<ModelEntry["uuid"]>,
        }
    }
}

const store: MyStore = {
    tables: {
        models: {
            _pk: [],
            uuid: ['abc', 'def', 'ghi'],
            name: ['model1', 'model2', 'model3'],
            description: ['desc1', 'desc2', 'desc3'],
        }
    },
    singles: {},
    error: '',
}

const { useTable, useTableRow, insertTableRow, deleteTableRow, updateTableRow } = CreateStore(store);

describe('Basic operations', () => {
    test('if initial state produces proper primary keys', () => {
        const { result } = renderHook(() => useTable<ModelEntry>('models'));
        renderHook(() => useTable<ModelEntry>('models'));
        expect(result.current.length).toBe(3);
        expect(result.current[0]._pk).toBe(1);
        expect(result.current[1]._pk).toBe(2);
        expect(result.current[2]._pk).toBe(3);
    });
    
    test('if new row is properly added', () => {
        act(() => {
            insertTableRow<ModelEntry>('models', { uuid: 'something', name: 'something', description: 'something'});
        });
        expect(store.tables.models._pk.length).toBe(4);
        expect(store.tables.models._pk.slice(-1)[0]).toBe(4);
    });

    it('should return null when row does not exist', () => {
        const { result } = renderHook(() => useTableRow<ModelEntry>('models', -1));
        expect(result.current).toBe(null);
    });

    it('should return row when it exists', () => {
        const { result } = renderHook(() => useTableRow<ModelEntry>('models', 1));
        expect(result.current?._pk).toBe(1);
    });

    it('should return a NULL row when the row is removed', () => {
        const { result } = renderHook(() => useTableRow<ModelEntry>('models', 1));
        act(() => {
            deleteTableRow('models', 1);
        })
        expect(result.current).toBe(null);
    });

    it('should return updated values when a row is updated', () => {
        const { result } = renderHook(() => useTableRow<ModelEntry>('models', 2));
        act(() => {
            updateTableRow('models', 2, { name: 'updatedName' });
        });
        expect(result.current?.name).toBe('updatedName');
    });

    // LEFT-OFF: adding tests for the notify logic (e.g., if only subscribed to UPDATE then....)
    // LEFT-OFF: why would I want the table to remain in an inconsistent state? I guess the primary keys remain the same...
    // LEFT-OFF: maybe they can simply opt-out of updates on the table for when values of a row are changed?
    it('should update the table when a row is removed', () => {
        const { result } = renderHook(() => useTable<ModelEntry>('models', []));
    });

});


// We do not need to render the component: https://www.toptal.com/react/testing-react-hooks-tutorial
// it and test are the same
// it and xit (temporarily exclude the test)
// test('if something does something')
// it('should do this thing')