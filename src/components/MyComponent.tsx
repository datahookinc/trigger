import { useTable, useTableRow, insertTableRow, updateTableRow, deleteTableRow, ModelEntry } from '../store/myStore';

export default function MyComponent() {
    const table = useTable<ModelEntry>('models');
    return (
        <>
            <div>This is my component</div>
            <div>Table has {table.length} rows</div>
            <button onClick={() => {
                insertTableRow<ModelEntry>('models', { uuid: 'uuid inserted', name: 'name inserted', description: 'description inserted'});
            }}>
                Add more rows
            </button>
            <button onClick={() => {
                updateTableRow<ModelEntry>('models', 9, { name: `${Date.now()}` });
            }}>
                Update Row
            </button>
            <button onClick={() => {
                deleteTableRow('models', 9);
            }}>
                Delete Row
            </button>
            {table.map(d => <ChildComponent key={d._pk} tName="models" pk={d._pk} />)}
        </>
    )
}

type Props = {
    tName: string;
    pk: number;
}

function ChildComponent({ tName, pk }: Props) {
    const row = useTableRow<ModelEntry>(tName, pk);
    return (
        <div>
            {row &&
                <div>
                    <div>{row._pk}</div>
                    <div>{row.description}</div>
                    <div>{row.name}</div>
                    <div>{row.uuid}</div>
                    <button onClick={() => {
                        deleteTableRow(tName, pk);
                    }}>Delete row</button>
                </div>
            }
        </div>
    )
}