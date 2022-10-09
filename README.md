# Welcome to Trigger!

Trigger is a typesafe (TypeScript) React state management system following data-oriented design principles.

`npm i @datahook/trigger`
<br/>

## Getting Started
### 1. Define our store

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

Notice how the **Order** table's _customerID_ property refers to the **Customer** table's _\_pk_ property. This is analogous to a foreign key in a database table. This makes it easier to understand the relationship; however, the regular _number_ could have also been used.

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
<br/><br/>
**store.ts**

```
import { extract, CreateQueue, CreateSingle, CreateTable } from '../src';
import type { Store, Table, Queue, Single } from '../src';

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

- CreateTable<T>(): A constructor that returns a typesafe table managed by trigger
- CreateSingle<T>(): A constructor that returns a typesafe single managed by trigger
- CreateQueue<T>(): A constructor that returns a typesafe queue managed by trigger
- extract(): Receives our store and extracts the tables, singles, and queues with read-only methods. This step is not required, but is highly recommended as it provides type errors when attempting to overwrite methods

Notes: uou can have as many stores as you want to manage; stores are implemented independently 

<br/><br/>
### 2. Using our store

Now that your store has been defined, created, and exported we can use it in our React application.

Each of trigger's managed types (tables, singles, and queues) has APIs and methods that influence what happens in your React app.