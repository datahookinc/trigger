import { extract } from "../src";

type AllowedSingularPrimitives = string | number | Date | boolean | null;
type IsUnion<T, B = T> = T extends B ? [B] extends [T] ? false : true : false;

// type NonNullableAllowedPrimitives = Exclude<AllowedPrimitives, null>;

// type NullableUnion<T> = T | null;
// type NonUnion<T> = IsUnion<T> extends true ? never : T
// type PermissableUnion<T extends AllowedSingularPrimitives> = IsUnion<T> extends true ? IsUnion<Exclude<T, null>> extends true ? "Type error: Only union with null is allowed" :T :T;


// LEFT-OFF: abandon this approach, the unions are not specific enough for me.

type PermissableUnion<T> = 
    T extends string ? (null extends T ? string | null : string) :
    T extends number ? (null extends T ? number | null : number) :
    never;

type PermissableTypes  = PermissableUnion<string | null> | PermissableUnion<number | null>

// type WithNull<T> = T | null

// type AllowedPrimitives = 
//     | string 
//     | number 
//     | Date 
//     | boolean 
//     | WithNull<string> 
//     | WithNull<number> 
//     | WithNull<Date> 
//     | WithNull<boolean>;


    // type AllowedPrimitives = 
    // | string 
    // | number 
    // | Date 
    // | boolean 
    // | WithNull<string> 
    // | WithNull<number> 
    // | WithNull<Date> 
    // | WithNull<boolean>;




// type UserRow = { [index: string]: NonNullableAllowedPrimitives | NullableUnion<NonNullableAllowedPrimitives> |  AllowedPrimitives[] | NullableUnion<AllowedPrimitives>[] | UserRow[] | NullableUnion<UserRow>[] | UserRow}; // Note: this is 
type UserRow = { [index: string]: PermissableTypes }; // Note: this is 

export type DefinedTable<T> = { [K in keyof T]: T[K][] }; // This is narrowed during CreateTable to ensure it extends TableRow
export type TableRow<T> = T & { _id: number } ;


function CreateTable<T extends UserRow>(t: DefinedTable<T> | (keyof T)[]): Table<TableRow<T>> { // LEFT-OFF: not sure what to do here; it does not like it when I add the extra property

    if (t instanceof Array) {
        t = t.reduce<{ [K in keyof T]: T[K][] }>((acc, cur) => {
            acc[cur] = [];
            return acc;
        }, {} as DefinedTable<T>);
    }

    // setup the autoID (accounting for any initial values)
    let autoID = 0;
    const nInitialLength = 5;
    const initialAUTOID: number[] = [];
    for (let i = 0; i < nInitialLength; i++) {
        initialAUTOID[i] = ++autoID;
    }

    const initialValues = { ...t, _id: initialAUTOID } as DefinedTable<TableRow<T>>; // put AUTOID last to override it if the user passes it in erroneously
    const table: DefinedTable<TableRow<T>> = initialValues; // manually add the "_id" so the user does not need to
    const originalColumnNames = Object.keys(t); // the user provided column names (without "_id")
    const x = Object.keys(initialValues);
    const columnNames = Object.keys(initialValues) as ("_id" | keyof T)[]; // the user provided column names + "_id"

    const _getRows = (where?: Partial<T> | ((v: TableRow<T>) => boolean) | null): TableRow<T>[] => { return [] }
    return {
        print(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, n = 50) {
            let rows = _getRows(where);
            rows = n == -1 ? rows : rows.slice(0, n);

            if (rows.length === 0) {
                const cols = this.columnNames();
                console.log('No rows found');
                console.table(Object.fromEntries(cols.map((d) => [d, []]))); // add an empty array to each column name
                return;
            }

            // transform the rows so the index is the _id instead of an arbitrary number
            const transformed = rows.reduce((acc, { _id, ...x }) => {
                acc[_id] = x;
                return acc;
            }, {} as { [index: number]: Omit<TableRow<T>, '_id'> });
            console.table(transformed);
        },
        clear(resetIndex = true) {
            // _clearTable();
            if (resetIndex) {
                autoID = 0;
            }
        },
        find(where?: Partial<T> | ((row: TableRow<T>) => boolean)): TableRow<T>[] {
            return _getRows(where);
        },
    }
}

export type Table<T extends UserRow> = {
    // export type Table<T extends UserRow<T>> = {
        print(where?: Partial<T> | ((row: TableRow<T>) => boolean) | null, n?: number): void; // a wrapper for console.table() API; by default will print the first 50 rows
        clear(resetIndex?: boolean): void; // clear the tables contents
        find(where?: Partial<T> | ((row: TableRow<T>) => boolean)): TableRow<T>[] 
    };


type Customer3 = {
    customerID: number | string;
    firstName: string;
    lastName: string;
    // orders: string[];
};

type Customer4 = {
    person: { name: string, age: number } | null;
}

type Customer5 = {
    person: (string | null)[] | null;
}

// LEFT-OFF: a trial run for why the types aren't matching up here for me
const table = CreateTable<Customer3>(['customerID', 'firstName', 'lastName']);
const values = table.find();
values
// CreateTable2<Customer4>({ person: { name: 'Josh', age:38 } });


// type UserTable<T> = Table<UserRow3<T>>; // LEFT-OFF: focus energy here: there is an odd problem happening with how it is being extended
// type UserTable<T extends UserRow3<T>> = Table<T>; // LEFT-OFF: focus energy here: there is an odd problem happening with how it is being extended



export interface Store {
    tables?: {
        // [index: string]: Table<ReturnType<<T extends UserRow3<T>>() => T>>;
        [index: string]: Table<ReturnType<<T extends UserRow>() => T>>;
        // [index: string]: Table<UserRow3<unknown>>; 
        // [index: string]: Table<UserRow3<T>>; 
        // [index: string]: Table<ReturnType<<T>() => Table<UserRow3<T>>>>; 
        // [index: string]: UserTable<ReturnType<<T extends UserRow3<T>>() => T>>;
        // [index: string]: Table<ReturnType<<T>() => ValidateUserRow<T>>>; // LEFT-OFF: this one satisfies the Store interface, but not the extraction part...


        
    };
}

// LEFT-OFF: this is where things are failing for me and I am not sure why...
// LEFT-OFF: that's enough this week for this piece, just do what you can to get Noodlr working.
interface MyStore extends Store {
    tables: {
        customers: Table<Customer3>; // Type '{ customers: Table<Customer3>; }' is not assignable to type '{ [index: string]: Table<UserRow3<any>>; }; TableRow<Customer>' is not assignable to type 'TableRow<UserRow<any>>; 'TableRow<Customer>' is not assignable to type '{ [x: string]: UserRow<any>; Property 'customerID' is incompatible with index signature.
        
    };
}

const s: MyStore = {
    tables: {
        customers: CreateTable<Customer3>(['customerID', 'firstName', 'lastName']),
    },
};

// LEFT-OFF: s from above actually works, it is the "s" being passed into extract that does not
// LEFT-OFF: Table<TableRow<T>> also is still causing problems

const { tables } = extract(s); // LEFT-OFF: somewhere around here, I have reduced UserRow3 to primitives only as a start, but it is not going well...

// The problem appears to be in letting TypeScript know that Customer and UserRow<Customer> are the same thing...as well as the fact that it is returning UserRow<unknown> any...

// the olduse row
// type UserRow = { [index: string]: AllowedPrimitives };



// type ValidateUnion2<T> =
//     IsUnion<T> extends true
//         ? IsAllowableUnion<T> extends true

// // is an allowed primitive
// ValidateAllowedPrimitives<T> extends true
//     ? IsUnion<T> extends true
//         // LEFT-OFF: I feel like this should be working, but it isn't
//         ? IsAllowableUnion<T> extends true
//             ? T
//             : "Type error: Only union with null is allowed"
//         : T 
//     // LEFT-OFF: the order of these might make a difference
//     // is nested object
//     // : T extends object
//     //     ? UserRow2<T>
//     //     : T extends Array<ValidateUnion2<T>>
//     //         ? T
//     //         : "Type error: Type must be an allowed primitive, or a nested object";
            
//     // LEFT-OFF: how to validate the array type without getting into a crazy level of instantiation?
//     // LEFT-OFF infer U pulls out the actual type
//     // LEFT-OFF: can also use type IsArrayOf<T, U> = T extends Array<U> ? true : false; (where we extend ValidateUnion2)
//     // : T extends Array<infer U>
//     //     ? ValidateUnion2<U>
//     //     : T extends object
//     //         ? UserRow2<T>
//     //         : "Type error: Type must be an allowed primitive, or a nested object";
//     : IsArray<T> extends true
//         ? IsValidArray<T> extends true
//             ? T
//             : "Type error: Array type is invalid"
//         : T extends object
//             ? UserRow2<T>
//             : "Type error: Type must be an allowed primitive, or a nested object";

            
// function something<T>(x: ValidateUnion2<T>) {
//     console.log(x);
// }

// something<{ name: string, age: number | null }>({ name: 'josh', age: 38 });
// something<{ name: string | null, age: number }>({ name: 'josh', age: 38 });
// something<{ name: string | { other: number, something: string }, age: number }>({ name: { other: 10, something: 'else' }, age: 38 }); // LEFT-OFF: this isn't working as intended (the only unions allowed should be with primitive types) (we need to check for unions first is why)
// something<{ name: string[] }>({ name: [] }) // LEFT-OFF: this isn't working as intended
// something<{ name: (string | null)[] }>({ name: [] }) // LEFT-OFF: this isn't working as intended


// type UserRow<T> = {
//     [P in keyof T]: ValidateUnion<T[P]>;
// };

// // LEFT-OFF: if I can figure this out, the rest should come
// // type ValidateUnion<T> =
// //     T extends AllowedPrimitives
// //     ? IsUnion<T> extends true
// //         ? never // LEFT-OFF: this logic is not working how I expect this should be failing for all union types below
// //         // ? IsUnion<Exclude<T, null>> extends true
// //         //     ? "Type error: Only union with null is allowed"
// //         //     : T
// //         : T // not a union, accept the singular primitive type
// //     : "Type error: Type must be an allowed primitive, an array, or a nested object"

// // LEFT-OFF: this check fails for singles
// // type ValidateUnion<T> =
// //     T extends AllowedPrimitives
// //         ? IsUnion<T> extends true
// //             ? "Unions not allowed"
// //             : T extends AllowedPrimitives
// //             ? T
// //         : never
// //     : "Type error: Type must be an allowed primitive, an array, or a nested object"

// // LEFT-OFF: these two ValidateUnions are quite different in how they work

// type ValidateUnion<T> =
//     IsUnion<T> extends true
//     ? "Unions not allowed"
//     : T extends AllowedPrimitives
//     ? T
//     : never


// // (string | null) extends AllowedPrimitives
// // then check if it is a union or not
// // FUCK FUCK FUCK FUCK FUCK FUCK!!!!!!




// // type ValidaeUnion<T> =
// //     IsUnion<T> extends true
// //     ? never // Fail the type check if T is a union
// //     : T extends AllowedPrimitives
// //     ? T
// //     : "Type error: Type must be an allowed primitive, an array, or a nested object";


// // ? Exclude<T, null> extends infer U
// //   ? U | null extends T
// //     ? T
// //     : "Type error: Only union with null is allowed"
// //   : never
// // : T extends Array<infer U>
// //   ? Array<ValidateUnion<U>>
// //   : T extends object
// //     ? UserRow<T>
// //     : "Type error: Type must be an allowed primitive, an array, or a nested object";




// //   type ValidateUnion<T> = 
// //   T extends AllowedPrimitives
// //     ? Exclude<T, null> extends infer U
// //       ? U | null extends T
// //         ? T
// //         : "Type error: Only union with null is allowed"
// //       : never
// //     : T extends Array<infer U>
// //       ? Array<ValidateUnion<U>>
// //       : T extends object
// //         ? UserRow<T>
// //         : "Type error: Type must be an allowed primitive, an array, or a nested object";


// function CreateTable<T extends UserRow<T>>(x: T) {
//     console.log(x);
// }

// type customer1 = {
//     name: string;
//     age: number;
// }

// type customer2 = {
//     other: boolean;
//     // other: boolean | null;
//     // other: boolean | null;
//     name: string | null;
//     // age: number | null;
//     age: number | string; // this is still FUCKING WRONG!!
// }

// CreateTable<customer1>({ name: 'josh', age: 38 });
// CreateTable<customer2>({ name: 'josh', age: 38, other: true });


