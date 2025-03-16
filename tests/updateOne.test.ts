import { act, renderHook } from '@testing-library/react';
import { CreateStore, CreateTable } from "../src";
import 'isomorphic-fetch'; // required because jest does not recognize node's global fetch API (even though it should when using node v18)

type Cat = {
    name: string;
    age: number;
}

const store = CreateStore({
    tables: {
        cat: CreateTable<Cat>(
            {
                name: ['Cleo', 'PJ', 'Cleo'],
                age: [3, 5, 4]
            },
        ),
    },
});

describe('Testing updateOne()', () => {
    it('should update the first row if the where clause is null', async () => {
        const result = store.tables.cat.updateOne(null, { name: 'Cleocatra' });
        expect(result).not.toBeUndefined();
        expect(result!.name).toEqual('Cleocatra');
    });
    it('should return undefined if no row is found', async () => {
        const result = store.tables.cat.updateOne({ name: 'Pickles' }, { name: 'Cleocatra' });
        expect(result).toBeUndefined();
    });
    it('should update the first row found', async () => {
        const result = store.tables.cat.updateOne({ name: 'PJ' }, { name: 'PicklesJr' });
        expect(result).not.toBeUndefined();
        expect(result!.name).toEqual('PicklesJr');
    });
    it('should update the first row found with a function', async () => {
        const result = store.tables.cat.updateOne((v) => v.name === 'PicklesJr', v => { v.name = 'PJ'; return v; });
        expect(result).not.toBeUndefined();
        expect(result!.name).toEqual('PJ');
    });
    it('should re-render when a row is updated', async () => {
        const { result } = renderHook(() => store.tables.cat.useById(2));
        expect(result.current).not.toBeUndefined();
        act(() => {
            store.tables.cat.updateOne({ name: 'PJ' }, { name: 'PicklesJr' });
        });
        expect(result.current?.name).toEqual('PicklesJr');
    });
    it('should return a row once the where clause is satisfied', async () => {
        const { result } = renderHook(() => store.tables.cat.useOne({ name: 'PJ' }));
        expect(result.current).toBeUndefined();
        act(() => {
            store.tables.cat.updateOne({ name: 'PicklesJr' }, { name: 'PJ' });
        });
        expect(result.current?.name).toEqual('PJ');
    });
});

