# Implementatation thoughts

    If you specify FOR EACH ROW,
    the trigger fires once for each row of the table that is affected by the triggering statement.
    The absence of the FOR EACH ROW option means that the trigger fires only once
    for each applicable statement, but not separately for each row affected by the statement.


    For example, you define the following trigger:

    CREATE TRIGGER log_salary_increase
    AFTER UPDATE ON emp
    FOR EACH ROW
    WHEN (new.sal > 1000)
    BEGIN
        INSERT INTO emp_log (emp_id, log_date, new_salary, action)
        VALUES (:new.empno, SYSDATE, :new.sal, 'NEW SAL');
    END;
    and then issue the SQL statement:

    UPDATE emp SET sal = sal + 1000.0
        WHERE deptno = 20;
    If there are five employees in department 20, the trigger will fire five times when this statement is issued, since five rows are affected.

    The following trigger fires only once for each UPDATE of the EMP table:

    CREATE TRIGGER log_emp_update
    AFTER UPDATE ON emp
    BEGIN
        INSERT INTO emp_log (log_date, action)
            VALUES (SYSDATE, 'EMP COMMISSIONS CHANGED');
    END;

    A trigger fired by an INSERT statement has meaningful access to new column values only. Because the row is being created by the INSERT, the old values are null.
    A trigger fired by an UPDATE statement has access to both old and new column values for both BEFORE and AFTER row triggers.
    A trigger fired by a DELETE statement has meaningful access to old column values only. Because the row will no longer exist after the row is deleted, the new values are null.

    Old and new values are available in both BEFORE and AFTER row triggers. A NEW column value can be assigned in a BEFORE row trigger, but not in an AFTER row trigger (because the triggering statement takes effect before an AFTER row trigger is fired). If a BEFORE row trigger changes the value of NEW.COLUMN, an AFTER row trigger fired by the same statement sees the change assigned by the BEFORE row trigger.

    BEFORE INSERT (can change "new")
    BEFORE UPDATE (can change "new")
    BEFORE DELETE
    AFTER INSERT
    AFTER UPDATE
    AFTER DELETE

    BEFORE INSERT FOR EACH ROW
    BEFORE UPDATE FOR EACH ROW
    BEFORE DELETE FOR EACH ROW

    onBeforeInsert
    onAfterInsert
    onBeforeUpdate
    onAfterUpdate
    onBeforeDelete
    onAfterDelete
    onBeforeInsertEachRow
    onAfterInsertEachRow
    onBeforeUpdateEachRow
    onAfterUpdateEachRow
    onBeforeDeleteEachRow
    onAfterDeleteEachRow

    // How Postgres returns updated rows
    UPDATE birthdays
    SET age = date_part('year', age(birthday))
    WHERE date_part('year', age(birthday)) != age 
    RETURNING name, birthday, age;

    https://docs.oracle.com/cd/A58617_01/server.804/a58241/ch9.htm#:~:text=If%20you%20specify%20FOR%20EACH,row%20affected%20by%20the%20statement.
