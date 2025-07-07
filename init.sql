CREATE TABLE IF NOT EXISTS payslips (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(7) NOT NULL CHECK (employee_id ~ '^ATS0(?!000)\d{3}$'),
    employee_name VARCHAR(30),
    designation VARCHAR(30),
    date_joining DATE CHECK (date_joining >= '1990-01-01' AND date_joining <= CURRENT_DATE),
    month_year VARCHAR(7) NOT NULL CHECK (month_year ~ '^\d{4}-\d{2}$'),
    employee_type VARCHAR(20) CHECK (employee_type IN ('Permanent', 'Contract', 'Temporary')),
    location VARCHAR(30),
    bank_name VARCHAR(30),
    account_no VARCHAR(16) CHECK (account_no ~ '^\d{9,16}$'),
    working_days INTEGER CHECK (working_days >= 0 AND working_days <= 31),
    lop INTEGER CHECK (lop >= 0 AND lop <= 31),
    pan VARCHAR(10) CHECK (pan ~ '^[A-Z]{5}\d{4}[A-Z]$'),
    duration VARCHAR(100),
    earnings JSONB NOT NULL,
    deductions JSONB NOT NULL,
    gross_pay DECIMAL(10, 2) NOT NULL CHECK (gross_pay >= 0),
    total_deductions DECIMAL(10, 2) NOT NULL CHECK (total_deductions >= 0),
    net_pay DECIMAL(10, 2) NOT NULL CHECK (net_pay >= 0),
    provident_fund VARCHAR(20),
    uan VARCHAR(20),
    esic VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_employee_month_year UNIQUE (employee_id, month_year)
);


CREATE INDEX idx_employee_id ON payslips (employee_id);
CREATE INDEX idx_month_year ON payslips (month_year);
CREATE INDEX idx_created_at ON payslips (created_at);



