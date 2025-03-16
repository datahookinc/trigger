import { act, renderHook } from '@testing-library/react';
import { CreateStore, CreateTable } from "../src";

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

describe('Testing useOne()', () => {
    it('should return the first row if no arguments provided', async () => {
        const { result } = renderHook(() => store.tables.cat.useOne());
        expect(result.current?.name).toEqual('Cleo');
    });
    it('should return undefined if no row is found', async () => {
        const { result } = renderHook(() => store.tables.cat.useOne({ name: 'Pickles' }));
        expect(result.current).toBeUndefined();
    });
    it('should return the first row found', async () => {
        const { result } = renderHook(() => store.tables.cat.useOne({ name: 'Cleo' }));
        expect(result.current?.age).toEqual(3);
    });
    it('should return the first row found', async () => {
        const { result } = renderHook(() => store.tables.cat.useOne({ name: 'Cleo', age: 4 }));
        expect(result.current?.age).toEqual(4);
    });
    it('should return the first row found with a function', async () => {
        const { result } = renderHook(() => store.tables.cat.useOne(v => v.name === 'PJ'));
        expect(result.current?.age).toEqual(5);
    });
    it('should re-render when a row is inserted', async () => {
        const { result } = renderHook(() => store.tables.cat.useOne({ name: 'Pickles' }));
        expect(result.current).toBeUndefined();
        act(() => {
            store.tables.cat.insertOne({ name: 'Pickles', age: 2 });
        });
        expect(result.current?.name).toEqual('Pickles');
    });
    it('should re-render when a row is deleted', async () => {
        const { result } = renderHook(() => store.tables.cat.useOne({ name: 'Stinky' }));
        expect(result.current).toBeUndefined();
        act(() => {
            store.tables.cat.insertOne({ name: 'Stinky', age: 2 });
        });
        expect(result.current?.name).toEqual('Stinky');
        act(() => {
            // await sleep(1_000); // Wait a bit longer than setTimeout in `TestAsyncComponent`
            store.tables.cat.deleteOne({ name: 'Stinky' });
        });
        expect(result.current).toBeUndefined();
    });
});

