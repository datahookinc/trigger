import CreateStore, { Store } from './trigger';

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

export type TableName = Extract<keyof Store["tables"], string>; // here to prevent TypeScript from using string | number as index

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

export {
    useTable,
    useTableRow,
    insertTableRow,
    updateTableRow,
    deleteTableRow,
}