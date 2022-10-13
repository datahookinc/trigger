# Welcome to Trigger!

Trigger is a typesafe (TypeScript) React state management system following data-oriented design principles (e.g., SOA).

`npm i @datahook/trigger`

<br/>

## Getting Started
### 1. Define our stores

In trigger, you start by defining the structure (types) of your store; your store will hold **Tables**, **Singles**, and **Queues**.

**Tables** can be envisioned as a table in database, with rows and columns. In trigger, each table has an autoincrementing primary key, defined as **_pk**. Best practice is to first define your table types as simple objects. In the example below, I have defined two table types (_Customer_ and _Orders_)

```
type Customer = {
    _pk: number;
    customerID: number;
    firstName: string;
    lastName: string;
}

type Order = {
    _pk: number;
    orderID: number;
    customerID: Customer["_pk"];
    orderDate: Date;
    orderLocation: string;
}
```

Notice how the **Order** table's _customerID_ property refers to the **Customer** table's _\_pk_ property. This is analogous to a foreign key in a database table. This makes it easier to understand the relationship; however, the regular _number_ type could have also been used.

In trigger, your tables must be "flat". This means table values can only be of the following types:

- string
- number
- Date
- boolean
- null

When you **insert** a row into a table, trigger will automatically handle assigning the **_pk** value to your rows.

**Singles** can be of any type. They allow maximum flexibility, but have a more limited API.

**Queues** can be of any type. Unlike **Tables** and **Singles**, **Queues** do not automatically re-render your component when items are added or removed.

Putting it together, this is what implementing a store looks like in Trigger.

<br/>

**store.ts**

```
import { extract, CreateQueue, CreateSingle, CreateTable } from '@datahook/trigger';
import type { Store, Table, Queue, Single } from '@datahook/trigger';

type Customer = {
    _pk: number;
    customerID: number;
    firstName: string;
    lastName: string;
};

type Order = {
    _pk: number;
    orderID: number;
    customerID: Customer['_pk'];
    orderDate: Date;
    orderLocation: string;
};

interface MyStore extends Store {
    tables: {
        customers: Table<Customer>;
        orders: Table<Order>;
    };
    queues: {
        eventQueue: Queue<string>;
    };
    singles: {
        numProductsOutOfStock: Single<number>;
        pendingActions: Single<boolean>;
        countChangesToNumProductsOutOfStock: Single<number>;
        numUpdates: Single<number>;
    };
}

const s: MyStore = {
    tables: {
        customers: CreateTable<Customer>({ _pk: [], customerID: [], firstName: [], lastName: [] }),
        orders: CreateTable<Order>({ _pk: [], orderID: [], customerID: [], orderLocation: [], orderDate: [] }),
    },
    queues: {
        eventQueue: CreateQueue<string>(),
    },
    singles: {
        numProductsOutOfStock: CreateSingle(0),
        pendingActions: CreateSingle(false),
        countChangesToNumProductsOutOfStock: CreateSingle(0),
        numUpdates: CreateSingle(0),
    },
};

export const { tables, singles, queues } = extract(s);
```

There are a few helper functions involved in creating the store:

- **CreateTable<T>()**: A constructor that returns a typesafe table managed by trigger
- **CreateSingle<T>()**: A constructor that returns a typesafe single managed by trigger
- **CreateQueue<T>()**: A constructor that returns a typesafe queue managed by trigger
- **extract()**: Receives our store and extracts the tables, singles, and queues with read-only methods. This step is not required, but is highly recommended as it provides type errors when attempting to overwrite methods

Notes: you can have as many stores as you want to manage; stores are implemented independently of one another.

<br/>

### 2. Using our store

Now that your store has been defined, created, and exported we can use it in our React application.

Each of trigger's managed types (tables, singles, and queues) has APIs and methods that influence what happens in your React app.

Here is an example of _using_ one of our tables:

<br/>

**MyCustomerList.tsx**

```
import { tables } from './store';

function MyCustomerList() {
  const rows = tables.customers.use(null, ['rowInsert']);

  const addRow = () => {
    tables.customers.insertRow({ customerID: 10, firstName: 'Happy', lastName: `McCustomer (${Date.now()})` });
  };

  return (
    <>
      <h1>My Customers List</h1>
      <ul>
        {rows.map(row => <li>{`${row.firstName} ${row.lastName}`}</li>)}
      </ul>

      <button onClick={addRow}>Add New Customer</button>   
    </>
)}

export default MyCustomerList;
```

In the above example, `tables.customers.use(null, ['rowInsert'])` means: "every time a new row is inserted, give me all of the rows in the table and rerender the component". The `null` can be replaced by a function that returns a `boolean` value for whether or not a row should be included in the result set.

# API

## Tables

`use(where: ((v: T) => boolean) | null, notify?: TableNotify[]): T[]`: will rerender your component. If notify is ommitted, the component will rerender for all events. Supported events are: `'rowInsert' | 'rowUpdate' | 'rowDelete'. If a filtering function is not provided, this will return all rows in the table.

`useRow(pk: PK, notify?: RowNotify[]): T | undefined`: will rerender your component. If notify is ommitted, the component will rerender for all events. Supported events are: `'rowDelete' | 'rowUpdate'`. User supplies the primary key (_pk) for the row they want to use.

`insertRow(r: Omit<T, '_pk'>): T | undefined`: insert row into the table. The user does not need to provide the _\_pk_ property as this will be handled automatically. This will return the newly inserted row or _undefined_ if the user has a **beforeInsertTrigger** attached to the table that aborts the insert.

`onBeforeInsert(fn: (v: T) => T | void | boolean): void`: a trigger function that can be attached to the table. The function will receive the row being insert and can make changes to it. The user can cancel the insert by returning `false`. Returning nothing or `true` will ignore any changes made in the function and insert the row as originally intended.

`onAfterInsert(fn: (v: T) => void): void`: a trigger function that can be attached to the table. The function will receive the newly inserted row.

`deleteRows(where?: PK | { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] } | ((v: T) => boolean)): number`: will return the number of rows that have been deleted, or 0 if no rows were deleted. The user can pass-in the primary key (_pk) to delete, an object to match rows to based on equality of each property value, or a function that returns `true` if the row should be deleted and `false` if it should not be deleted.

`onDelete(fn: (v: T) => void): void`: a trigger function that can be attached to the table. The function will receive the record that has been deleted.

`updateRow(pk: PK, valueMap: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] }): boolean`: will return `true` if the update was successful and `false` if not. The user passes in the primary key (_pk) to update, and an object with the new property values.

`onUpdate(fn: (v: T) => void): void`: a trigger function that can be attached to the table. The function will receive the new values of the row that was updated.

`getRows(where?: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] } | ((v: T) => boolean)): T[]`: will return all rows that match. The user can pass-in an object to match rows to based on equality of each property value, or a function that returns `true` if the row should be returned and `false` if it should not be returned. This function does not cause your component to rerender. Passing in nothing will return all rows.

`getRow(where: PK | { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] } | ((v: T) => boolean)): T | undefined`: a convenience function for returning the first matching row. The user can pass-in the primary key (_pk) to find, an object to match rows to based on equality of each property value, or a function that returns `true` if the row should be returned and `false` if it should not be returned. If no row can be found, `undefined` is returned. 

`getRowCount(where?: { [Property in keyof T as Exclude<Property, '_pk'>]?: T[Property] } | ((v: T) => boolean)): number`: returns the current number of rows in the table. The user can pass-in an object to match rows to based on equality of each property value, or a function that returns `true` if the row should be counted and `false` if it should not be counted. This function does not cause your component to rerender. Passing in nothing will count all rows in the table

## Singles

`use(): T`: will rerender your component. Every time the underlying object changes, the new value will be returned and your component will be rerendered.

`set(v: T): boolean`: allows for changing the value. Trigger uses shallow equality comparisons (===) to determine if the underlying value has changed. So, if your underlying value is an object (like an array) you should call `set` with a new reference to the array (e.g., `set([...oldArr, newValue])`)

`onSet(fn: (v: T) => void): void`: a trigger function that can be attached to a single each the value is changed. The function will receive the new value.

`onGet(fn: (v: T) => void): void`: a trigger function that can be attached to a single each time the value is retrieved. The function will receive the value each time `get()` is called.

`get(): T`: will retrieve the value, but not cause your component to rerender

## Queues

`insert(item: T, cb?: (ok: boolean) => void): boolean`: insert a new item into the queue. Will return `true` if the insert was successful and `false` if not

`onInsert(fn: (v: T) => void): void`: a trigger function that can be attached to a queue. The function will receive the inserted value.

`get(): QueueItem<T> | undefined`: will retrieve the item at the head of the queue, or undefined if the queue is currently empty.

`onGet(fn: (v: T) => void): void`: a trigger function that can be attached to a queue. The function will recieve will receive the value each time `get()` is called.

`size(): number`: will return the number of items in the queue

Note: methods starting with `use` will cause your component to rerender. No other method will cause your component to rerender.
