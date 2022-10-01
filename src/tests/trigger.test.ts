import { renderHook, act } from '@testing-library/react';
import CreateStore, { Store, TriggerAPI } from '../trigger/trigger';

type ModelEntry = {
    _pk: number;
    uuid: string;
    name: string;
    description: string;
}

type TabEntry = {
    _pk: number;
    uuid: string;
    name: string;
    description: string;
    active: boolean;
}

type ModelRef = {
    _pk: number;
    parentPK: number;
    unsavedChanges: boolean;
    isOpen: boolean;
}

interface MyStore extends Store {
    tables: {
        models: {
            _pk: Array<ModelEntry["_pk"]>;
            uuid: Array<ModelEntry["uuid"]>;
            name: Array<ModelEntry["name"]>;
            description: Array<ModelEntry["description"]>;
        };
        modelRefs: {
            _pk: Array<ModelRef["_pk"]>;
            parentPK: Array<ModelRef["parentPK"]>;
            unsavedChanges: Array<ModelRef["unsavedChanges"]>;
            isOpen: Array<ModelRef["isOpen"]>;
        }
        tabs: {
            _pk: Array<TabEntry["_pk"]>;
            uuid: Array<TabEntry["uuid"]>;
            name: Array<TabEntry["name"]>;
            description: Array<TabEntry["description"]>;
            active: Array<TabEntry["active"]>;
        };
    };
    triggers: {
        tables: {
            models: {
                onInsert(api: TriggerAPI, v: ModelEntry): void;
                // onDelete: <ModelEntry>(api: TriggerAPI, v: ModelEntry) => {};
                // onUpdate: <ModelEntry>(api: TriggerAPI, v: ModelEntry) => {};
            };
        },
    };
    singles: {
        unsavedChanges?: boolean;
        count: number;
        tabs: Array<string>;
    };
    error: string;
}

const store: MyStore = {
    tables: {
        models: {
            _pk: [],
            uuid: ['abc', 'def', 'ghi'],
            name: ['model1', 'model2', 'model3'],
            description: ['desc1', 'desc2', 'desc3'],
        },
        modelRefs: {
            _pk: [],
            parentPK: [],
            unsavedChanges: [],
            isOpen: [],
        },
        tabs: {
            _pk: [],
            uuid: ['a', 'b', 'c'],
            name: ['name-a', 'name-b', 'name-c'],
            description: ['desc-a', 'desc-b', 'desc-c'],
            active: [true, false, false],
        },
    },
    triggers: {
        tables: {
            models: {
                onInsert: (api: TriggerAPI, v: ModelEntry) => {
                    api.insertTableRow<ModelRef>('modelRefs', { parentPK: v._pk, unsavedChanges: false, isOpen: false });
                },
            }
        },
    },
    singles: {
        count: 0,
        tabs: ['tab-1', 'tab-2'],
    },
    error: '',
}

const { 
    useTable,
    useTableRow,
    insertTableRow,
    insertTableRows,
    deleteTableRow,
    updateTableRow,
    findTableRow,
    clearTable,
    useSingle,
    setSingle,
    getSingle 
} = CreateStore(store);

describe('Basic operations', () => {
    test('if initial state produces proper primary keys', () => {
        const { result } = renderHook(() => useTable<ModelEntry>('models', null));
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
        expect(result.current).toBeNull();
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
        expect(result.current).toBeNull();
    });

    it('should return updated values when a row is updated', () => {
        const { result } = renderHook(() => useTableRow<ModelEntry>('models', 2));
        act(() => {
            updateTableRow('models', 2, { name: 'updatedName' });
        });
        expect(result.current?.name).toBe('updatedName');
    });

    it('should update the table when a row is changed', () => {
        const { result } = renderHook(() => useTable<ModelEntry>('models', null, ['rowUpdate']));
        act(() => {
            updateTableRow('models', 2, { name: 'updatedNameAgain' });
        });
        const value = result.current.find(d => d._pk === 2);
        expect(value?.name).toBe('updatedNameAgain');
    });

    it('should not update the table when a row is changed', () => {
        const { result } = renderHook(() => useTable<ModelEntry>('models', null, ['rowDelete', 'rowInsert']));
        act(() => {
            updateTableRow('models', 2, { name: 'updatedNameToNewValue' });
        });
        const value = result.current.find(d => d._pk === 2);
        expect(value?.name).toBe('updatedNameAgain');
    });

    it('should clear the table and reset the index', () => {
        const { result } = renderHook(() => useTable<ModelEntry>('models', null, []));
        act(() => {
            clearTable('models');
        });
        expect(result.current.length).toBe(0);
    });

    it('should batch insert three rows', () => {
        const { result } = renderHook(() => useTable<ModelEntry>('models', null, []));
        act(() => {
            const rows = [
                { uuid: 'model-1', name: 'name-1', description: 'desc-1', },
                { uuid: 'model-2', name: 'name-2', description: 'desc-2', },
                { uuid: 'model-3', name: 'name-3', description: 'desc-3', },
            ]
            insertTableRows<ModelEntry>('models', rows);
        });
        expect(result.current.length).toBe(3);
        expect(result.current[2].name).toBe('name-3');
    });

    it('should return an empty array when the insert array is empty', () => {
        const entries = insertTableRows<ModelEntry>('models', []);
        expect(entries.length).toBe(0);
    });

    it('should return null when the single value has not been set', () => {
        const { result } = renderHook(() => useSingle<boolean>('unsavedChanges'));
        expect(result.current).toBe(null);
    });

    it('should return the single value when it has been set', () => {
        const { result: resultA } = renderHook(() => useSingle<boolean>('unsavedChanges'));
        const { result: resultB } = renderHook(() => useSingle<number>('count'));
        const { result: resultC } = renderHook(() => useSingle<Array<string>>('tabs'));

        act(() => {
            setSingle('unsavedChanges', true);
            setSingle('count', 100);
            setSingle('tabs', ['tab-3', 'tab-4']);
        });

        expect(resultA.current).toBe(true);
        expect(resultB.current).toBe(100);
        expect(resultC.current?.length).toBe(2);
        expect(resultC.current?.[0]).toBe('tab-3');
        expect(resultC.current?.[1]).toBe('tab-4');
    });

    it('should return the single value',  () => {
        const { result } = renderHook(() => getSingle<boolean>('unsavedChanges'))
        expect(result.current).toBe(true);
    });

    it('should return false if inserting rows that are not objects', () => {
        const x: any = undefined;
        const resultA = insertTableRow<any>('models', []);
        const resultB = insertTableRow<any>('models', x as Object);
        const resultC = insertTableRows<any>('models', [{}, [], [undefined]]);
        expect(resultA).toBeNull();
        expect(resultB).toBeNull();
        expect(resultC).toEqual([]);
    });

    it('should return the found row, or null if not found', () => {
        const { result: resultA } = renderHook(() => findTableRow<ModelEntry>('models', { name: 'name-3' }));
        const { result: resultB } = renderHook(() => findTableRow<ModelEntry>('models', { name: 'name-2', description: 'desc-2' }));
        const { result: resultC } = renderHook(() => findTableRow<ModelEntry>('models', { name: 'name-10' }));
        expect(resultA.current?.name).toBe('name-3');
        expect(resultB.current?.description).toBe('desc-2');
        expect(resultC.current).toBeNull();
    });

    it('should use the trigger to add an entry to modelRefs', () => {
        const { result } = renderHook(() => insertTableRow<ModelEntry>('models', { uuid: 'model-4', name: 'name-4', description: 'desc-4' }));
        const { result: resultFindRef } = renderHook(() => findTableRow<ModelRef>('modelRefs', { parentPK: result?.current?._pk }));
        
        expect(result.current).toBeDefined();
        expect(result.current?.uuid).toBe('model-4');
        expect(resultFindRef.current).toBeDefined();
        expect(resultFindRef.current?.parentPK).toBe(result.current?._pk);
    })

    it('should only return table rows where the model name is greater than 4', () => {
        const { result } = renderHook(() => useTable<ModelEntry>('models', (v: ModelEntry) => parseInt(v.name[v.name.length-1]) >= 3)); 
        expect(result.current.length).toBe(2);
        expect(result.current?.[0].name).toBe('name-3');
    });

    it('should update the returned values based on the filter', () => {
        const { result } = renderHook(() => useTable<ModelEntry>('models', (v: ModelEntry) => parseInt(v.name[v.name.length-1]) >= 3)); 
        act(() => {
            insertTableRow<ModelEntry>('models', { uuid: 'model-4', name: 'name-9', description: 'desc-4' });
        });
        expect(result.current.length).toBe(3);
        expect(result.current?.[2].name).toBe('name-9');
    });
});

// We do not need to render the component: https://www.toptal.com/react/testing-react-hooks-tutorial
// it and test are the same
// it and xit (temporarily exclude the test)
// test('if something does something')
// it('should do this thing')


// TODO: need to add error-handling tests
// TODO: allow batch deletes
// TODO: deleting a row should delete any listeners for that row
// TODO: ability to reset the entire store (this will be difficult)
// TODO: create responsive queries? (e.g., select from x where)

// THOUGHTS: may want to consider using upsertTableRow() as a way to both INSERT and UPDATE?