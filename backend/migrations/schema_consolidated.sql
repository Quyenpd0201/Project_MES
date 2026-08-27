-- =============================================================
-- MES - Schema tổng hợp (squashed từ schema.sql + schema_v2..v44)
-- Tạo bởi pg_dump từ DB_MES ngày 2026-08-27
-- Chạy bằng: node backend/scripts/migrate.js
-- =============================================================

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;




--
-- Name: gen_code_trg(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gen_code_trg() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  prefix  text := TG_ARGV[0];
  width   int  := TG_ARGV[1]::int;
  colname text := TG_ARGV[2];
  cur     text;
  nextn   int;
  rec     jsonb;
BEGIN
  rec := to_jsonb(NEW);
  cur := rec->>colname;
  IF cur IS NULL OR cur = '' THEN
    EXECUTE format(
      'SELECT COALESCE(MAX(NULLIF(regexp_replace(%I, ''[^0-9]'', '''', ''g''), '''')::int), 0) + 1 FROM %I',
      colname, TG_TABLE_NAME
    ) INTO nextn;
    rec := jsonb_set(rec, ARRAY[colname], to_jsonb(prefix || lpad(nextn::text, width, '0')));
    NEW := jsonb_populate_record(NEW, rec);
  END IF;
  RETURN NEW;
END
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: bom_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bom_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bom_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bom_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bom_id uuid NOT NULL,
    material_id uuid NOT NULL,
    quantity numeric(14,4) DEFAULT 0 NOT NULL,
    unit character varying(30),
    ratio_percent numeric(7,3),
    line_no integer DEFAULT 1 NOT NULL,
    note text
);


--
-- Name: boms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bom_code character varying(30) NOT NULL,
    product_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    bom_type character varying(30) DEFAULT 'Äá»‹nh má»©c NVL'::character varying NOT NULL,
    output_quantity numeric(14,3) DEFAULT 1 NOT NULL,
    output_unit character varying(30),
    status character varying(20) DEFAULT 'Hoáº¡t Ä‘á»™ng'::character varying NOT NULL,
    note text,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    process_id uuid,
    CONSTRAINT boms_bom_type_check CHECK (((bom_type)::text = ANY ((ARRAY['Äá»‹nh má»©c NVL'::character varying, 'CÃ´ng thá»©c pha mÃ u'::character varying])::text[]))),
    CONSTRAINT boms_status_check CHECK (((status)::text = ANY ((ARRAY['Hoáº¡t Ä‘á»™ng'::character varying, 'KhÃ´ng hoáº¡t Ä‘á»™ng'::character varying])::text[])))
);


--
-- Name: customer_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_code character varying(30) NOT NULL,
    name character varying(255) NOT NULL,
    customer_type character varying(20) DEFAULT 'KhÃ¡ch sá»‰'::character varying NOT NULL,
    phone character varying(30),
    email character varying(150),
    address text,
    status character varying(20) DEFAULT 'Hoáº¡t Ä‘á»™ng'::character varying NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customers_customer_type_check CHECK (((customer_type)::text = ANY ((ARRAY['KhÃ¡ch sá»‰'::character varying, 'KhÃ¡ch láº»'::character varying])::text[]))),
    CONSTRAINT customers_status_check CHECK (((status)::text = ANY ((ARRAY['Hoáº¡t Ä‘á»™ng'::character varying, 'KhÃ´ng hoáº¡t Ä‘á»™ng'::character varying])::text[])))
);


--
-- Name: delivery_note_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_note_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_note_id uuid NOT NULL,
    product_id uuid,
    product_name character varying(255),
    specs jsonb DEFAULT '{}'::jsonb NOT NULL,
    quantity numeric(14,2) DEFAULT 0 NOT NULL,
    unit character varying(30),
    unit_price numeric(16,2) DEFAULT 0 NOT NULL,
    amount numeric(16,2) DEFAULT 0 NOT NULL,
    line_no integer
);


--
-- Name: delivery_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_code character varying(30),
    sales_order_id uuid,
    customer_id uuid,
    delivery_date date,
    status character varying(40) DEFAULT 'ÄÃ£ xuáº¥t hÃ³a Ä‘Æ¡n'::character varying NOT NULL,
    note text,
    total_amount numeric(16,2) DEFAULT 0 NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_amount numeric(16,2) DEFAULT 0 NOT NULL,
    CONSTRAINT delivery_notes_status_check CHECK (((status)::text = ANY ((ARRAY['ÄÃ£ xuáº¥t hÃ³a Ä‘Æ¡n'::character varying, 'Chá» thanh toÃ¡n'::character varying, 'ÄÃ£ thanh toÃ¡n 1 pháº§n'::character varying, 'ÄÃ£ thanh toÃ¡n'::character varying, 'ÄÃ£ há»§y'::character varying])::text[])))
);


--
-- Name: employee_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_code character varying(20) NOT NULL,
    name character varying(150) NOT NULL,
    factory character varying(50),
    "position" character varying(100),
    skill_level character varying(30),
    phone character varying(30),
    status character varying(20) DEFAULT 'Hoáº¡t Ä‘á»™ng'::character varying NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employees_status_check CHECK (((status)::text = ANY ((ARRAY['Hoáº¡t Ä‘á»™ng'::character varying, 'KhÃ´ng hoáº¡t Ä‘á»™ng'::character varying])::text[])))
);


--
-- Name: inventory_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    location_id uuid,
    attr_size character varying(100) DEFAULT ''::character varying NOT NULL,
    attr_thickness character varying(100) DEFAULT ''::character varying NOT NULL,
    attr_color character varying(100) DEFAULT ''::character varying NOT NULL,
    quantity numeric(14,2) DEFAULT 0 NOT NULL,
    unit character varying(30),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expiry_date date,
    counted_qty numeric(14,2),
    counted_date date,
    specs jsonb DEFAULT '{}'::jsonb NOT NULL,
    spec_key text DEFAULT ''::text NOT NULL,
    lot_code character varying(40) DEFAULT ''::character varying NOT NULL,
    prod_order_id uuid
);


--
-- Name: inventory_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    location_id uuid,
    trx_type character varying(20) NOT NULL,
    quantity numeric(14,2) NOT NULL,
    attr_size character varying(100) DEFAULT ''::character varying,
    attr_thickness character varying(100) DEFAULT ''::character varying,
    attr_color character varying(100) DEFAULT ''::character varying,
    ref_code character varying(50),
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    specs jsonb DEFAULT '{}'::jsonb NOT NULL,
    spec_key text DEFAULT ''::text NOT NULL,
    lot_code character varying(40) DEFAULT ''::character varying NOT NULL,
    CONSTRAINT inventory_transactions_trx_type_check CHECK (((trx_type)::text = ANY ((ARRAY['Nháº­p'::character varying, 'Xuáº¥t'::character varying, 'Äiá»u chá»‰nh'::character varying])::text[])))
);


--
-- Name: location_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.location_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    location_code character varying(30) NOT NULL,
    name character varying(150) NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: machine_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.machine_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.machines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    machine_code character varying(30) NOT NULL,
    name character varying(150) NOT NULL,
    factory character varying(50) NOT NULL,
    machine_type character varying(50),
    status character varying(20) DEFAULT 'Hoáº¡t Ä‘á»™ng'::character varying NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT machines_factory_check CHECK (((factory)::text = ANY ((ARRAY['NhÃ  mÃ¡y thá»•i'::character varying, 'NhÃ  mÃ¡y cáº¯t'::character varying])::text[]))),
    CONSTRAINT machines_status_check CHECK (((status)::text = ANY ((ARRAY['Hoáº¡t Ä‘á»™ng'::character varying, 'Báº£o trÃ¬'::character varying, 'Ngá»«ng'::character varying])::text[])))
);


--
-- Name: process_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.process_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: process_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.process_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    seq integer DEFAULT 1 NOT NULL,
    name character varying(100) NOT NULL,
    machine_type character varying(80),
    input_product_id uuid,
    output_product_id uuid,
    yield_percent numeric(7,3),
    scrap_percent numeric(7,3),
    note text,
    workshop character varying(100),
    machine_id uuid,
    input_product_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    duration_minutes numeric(12,2),
    inputs jsonb DEFAULT '[]'::jsonb NOT NULL,
    output_quantity numeric(14,2),
    output_unit character varying(30),
    machine_ids jsonb
);


--
-- Name: prod_order_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prod_order_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    name character varying(255),
    content_type character varying(120),
    is_image boolean DEFAULT false NOT NULL,
    data text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: production_material_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_material_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    production_order_id uuid NOT NULL,
    material_id uuid NOT NULL,
    qty numeric(14,2) DEFAULT 0 NOT NULL,
    unit character varying(30),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: production_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_code character varying(30) NOT NULL,
    sales_order_id uuid,
    customer_id uuid,
    product_id uuid NOT NULL,
    quantity numeric(14,2) NOT NULL,
    unit character varying(30),
    attr_size character varying(100),
    attr_thickness character varying(100),
    attr_color character varying(100),
    finishing jsonb DEFAULT '[]'::jsonb NOT NULL,
    machine_id uuid,
    planned_date date,
    shift character varying(20),
    assigned_team character varying(100),
    group_key character varying(200),
    due_date date,
    status character varying(20) DEFAULT 'Chá» duyá»‡t'::character varying NOT NULL,
    note text,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sales_order_item_id uuid,
    inventory_posted boolean DEFAULT false NOT NULL,
    assigned_worker character varying(100),
    specs jsonb DEFAULT '{}'::jsonb NOT NULL,
    spec_key text DEFAULT ''::text NOT NULL,
    CONSTRAINT production_orders_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT production_orders_shift_check CHECK ((((shift)::text = ANY ((ARRAY['Ca 1'::character varying, 'Ca 2'::character varying, 'Ca 3'::character varying])::text[])) OR (shift IS NULL))),
    CONSTRAINT production_orders_status_check CHECK (((status)::text = ANY ((ARRAY['Chá» duyá»‡t'::character varying, 'ÄÃ£ lÃªn káº¿ hoáº¡ch'::character varying, 'Äang sáº£n xuáº¥t'::character varying, 'HoÃ n thÃ nh'::character varying, 'ÄÃ£ há»§y'::character varying])::text[])))
);


--
-- Name: production_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    production_order_id uuid NOT NULL,
    task_code character varying(40) NOT NULL,
    stage character varying(20) NOT NULL,
    quantity numeric(14,2) DEFAULT 0 NOT NULL,
    machine_id uuid,
    shift character varying(20),
    planned_date date,
    assigned_team character varying(100),
    assigned_worker character varying(100),
    status character varying(20) DEFAULT 'Chá»'::character varying NOT NULL,
    seq integer DEFAULT 1 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    planned_end_date date,
    actual_qty numeric(14,2),
    scrap_qty numeric(14,2) DEFAULT 0 NOT NULL,
    CONSTRAINT production_tasks_stage_check CHECK (((stage)::text = ANY ((ARRAY['Thá»•i'::character varying, 'Cáº¯t'::character varying])::text[]))),
    CONSTRAINT production_tasks_status_check CHECK (((status)::text = ANY ((ARRAY['Chá»'::character varying, 'Äang sáº£n xuáº¥t'::character varying, 'Dá»«ng sáº£n xuáº¥t'::character varying, 'HoÃ n thÃ nh'::character varying, 'ÄÃ£ há»§y'::character varying])::text[])))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_code character varying(30) NOT NULL,
    product_name character varying(255) NOT NULL,
    production_area character varying(100),
    category character varying(100),
    product_type character varying(30) NOT NULL,
    product_group character varying(100),
    unit character varying(30),
    barcode_type character varying(30),
    tracking_type character varying(20),
    is_pqc_required boolean DEFAULT false NOT NULL,
    status character varying(20) DEFAULT 'Hoáº¡t Ä‘á»™ng'::character varying NOT NULL,
    description text,
    attributes jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    product_types jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT products_status_check CHECK (((status)::text = ANY ((ARRAY['Hoáº¡t Ä‘á»™ng'::character varying, 'KhÃ´ng hoáº¡t Ä‘á»™ng'::character varying])::text[]))),
    CONSTRAINT products_tracking_type_check CHECK (((tracking_type)::text = ANY ((ARRAY['Theo lÃ´'::character varying, 'Theo serial'::character varying])::text[])))
);


--
-- Name: role_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.role_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_code character varying(20) NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'Hoáº¡t Ä‘á»™ng'::character varying NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    CONSTRAINT roles_status_check CHECK (((status)::text = ANY ((ARRAY['Hoáº¡t Ä‘á»™ng'::character varying, 'KhÃ´ng hoáº¡t Ä‘á»™ng'::character varying])::text[])))
);


--
-- Name: sales_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sales_order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(14,2) NOT NULL,
    unit character varying(30),
    attr_size character varying(100),
    attr_thickness character varying(100),
    attr_color character varying(100),
    note text,
    is_planned boolean DEFAULT false NOT NULL,
    planned_qty numeric(14,2) DEFAULT 0 NOT NULL,
    specs jsonb DEFAULT '{}'::jsonb NOT NULL,
    spec_key text DEFAULT ''::text NOT NULL,
    core_weight numeric(14,2),
    total_weight numeric(14,2),
    planned_start_date date,
    planned_end_date date,
    actual_start_date timestamp with time zone,
    actual_end_date timestamp with time zone,
    CONSTRAINT sales_order_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: sales_order_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sales_order_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sales_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_code character varying(30) NOT NULL,
    customer_id uuid NOT NULL,
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date,
    status character varying(50) DEFAULT 'Má»›i'::character varying NOT NULL,
    note text,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sales_orders_status_check CHECK (((status)::text = ANY ((ARRAY['Má»›i'::character varying, 'Äang sáº£n xuáº¥t'::character varying, 'HoÃ n thÃ nh sáº£n xuáº¥t'::character varying, 'Chuyá»ƒn hÃ ng 1 pháº§n'::character varying, 'Äang váº­n chuyá»ƒn'::character varying, 'ÄÃ£ váº­n chuyá»ƒn, chÆ°a thanh toÃ¡n'::character varying, 'ÄÃ£ thanh toÃ¡n'::character varying, 'HoÃ n thÃ nh'::character varying, 'ÄÃ£ há»§y'::character varying])::text[])))
);


--
-- Name: shift_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shift_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shift_code character varying(20) NOT NULL,
    name character varying(50) NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    status character varying(20) DEFAULT 'Hoáº¡t Ä‘á»™ng'::character varying NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shifts_status_check CHECK (((status)::text = ANY ((ARRAY['Hoáº¡t Ä‘á»™ng'::character varying, 'KhÃ´ng hoáº¡t Ä‘á»™ng'::character varying])::text[])))
);


--
-- Name: tech_processes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tech_processes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_code character varying(20) NOT NULL,
    name character varying(200) NOT NULL,
    product_id uuid,
    status character varying(20) DEFAULT 'Hoáº¡t Ä‘á»™ng'::character varying NOT NULL,
    note text,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tech_processes_status_check CHECK (((status)::text = ANY ((ARRAY['Hoáº¡t Ä‘á»™ng'::character varying, 'KhÃ´ng hoáº¡t Ä‘á»™ng'::character varying])::text[])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(150),
    role_id uuid,
    status character varying(20) DEFAULT 'Hoáº¡t Ä‘á»™ng'::character varying NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    team character varying(100),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['Hoáº¡t Ä‘á»™ng'::character varying, 'KhÃ´ng hoáº¡t Ä‘á»™ng'::character varying])::text[])))
);


--
-- Name: warehouse_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warehouse_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_code character varying(30) NOT NULL,
    name character varying(150) NOT NULL,
    warehouse_type character varying(20) DEFAULT 'NVL'::character varying NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(30) DEFAULT 'Hoáº¡t Ä‘á»™ng'::character varying NOT NULL,
    CONSTRAINT warehouses_warehouse_type_check CHECK (((warehouse_type)::text = ANY ((ARRAY['NVL'::character varying, 'BTP'::character varying, 'TP'::character varying])::text[])))
);


--
-- Name: work_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    work_date date NOT NULL,
    shift_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    check_in_at timestamp with time zone,
    check_out_at timestamp with time zone
);


--
-- Name: bom_lines bom_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_lines
    ADD CONSTRAINT bom_lines_pkey PRIMARY KEY (id);


--
-- Name: boms boms_bom_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boms
    ADD CONSTRAINT boms_bom_code_key UNIQUE (bom_code);


--
-- Name: boms boms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boms
    ADD CONSTRAINT boms_pkey PRIMARY KEY (id);


--
-- Name: customers customers_customer_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: delivery_note_items delivery_note_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_note_items
    ADD CONSTRAINT delivery_note_items_pkey PRIMARY KEY (id);


--
-- Name: delivery_notes delivery_notes_note_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_note_code_key UNIQUE (note_code);


--
-- Name: delivery_notes delivery_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_pkey PRIMARY KEY (id);


--
-- Name: employees employees_employee_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employee_code_key UNIQUE (employee_code);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: inventory_stock inventory_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_pkey PRIMARY KEY (id);


--
-- Name: inventory_transactions inventory_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: locations locations_warehouse_id_location_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_warehouse_id_location_code_key UNIQUE (warehouse_id, location_code);


--
-- Name: machines machines_machine_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_machine_code_key UNIQUE (machine_code);


--
-- Name: machines machines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_pkey PRIMARY KEY (id);


--
-- Name: process_steps process_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_steps
    ADD CONSTRAINT process_steps_pkey PRIMARY KEY (id);


--
-- Name: product_attachments product_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attachments
    ADD CONSTRAINT product_attachments_pkey PRIMARY KEY (id);


--
-- Name: production_material_usage production_material_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_material_usage
    ADD CONSTRAINT production_material_usage_pkey PRIMARY KEY (id);


--
-- Name: production_material_usage production_material_usage_production_order_id_material_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_material_usage
    ADD CONSTRAINT production_material_usage_production_order_id_material_id_key UNIQUE (production_order_id, material_id);


--
-- Name: production_orders production_orders_order_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_orders
    ADD CONSTRAINT production_orders_order_code_key UNIQUE (order_code);


--
-- Name: production_orders production_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_orders
    ADD CONSTRAINT production_orders_pkey PRIMARY KEY (id);


--
-- Name: production_tasks production_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_tasks
    ADD CONSTRAINT production_tasks_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_product_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_product_code_key UNIQUE (product_code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_role_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_role_code_key UNIQUE (role_code);


--
-- Name: sales_order_items sales_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT sales_order_items_pkey PRIMARY KEY (id);


--
-- Name: sales_orders sales_orders_order_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_order_code_key UNIQUE (order_code);


--
-- Name: sales_orders sales_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_shift_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_shift_code_key UNIQUE (shift_code);


--
-- Name: tech_processes tech_processes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tech_processes
    ADD CONSTRAINT tech_processes_pkey PRIMARY KEY (id);


--
-- Name: tech_processes tech_processes_process_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tech_processes
    ADD CONSTRAINT tech_processes_process_code_key UNIQUE (process_code);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_warehouse_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_warehouse_code_key UNIQUE (warehouse_code);


--
-- Name: work_schedules work_schedules_employee_id_work_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_schedules
    ADD CONSTRAINT work_schedules_employee_id_work_date_key UNIQUE (employee_id, work_date);


--
-- Name: work_schedules work_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_schedules
    ADD CONSTRAINT work_schedules_pkey PRIMARY KEY (id);


--
-- Name: idx_bomlines_bom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bomlines_bom ON public.bom_lines USING btree (bom_id);


--
-- Name: idx_boms_process; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_boms_process ON public.boms USING btree (process_id);


--
-- Name: idx_boms_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_boms_product ON public.boms USING btree (product_id);


--
-- Name: idx_dni_note; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dni_note ON public.delivery_note_items USING btree (delivery_note_id);


--
-- Name: idx_pa_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pa_product ON public.product_attachments USING btree (product_id, created_at DESC);


--
-- Name: idx_pmu_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pmu_po ON public.production_material_usage USING btree (production_order_id);


--
-- Name: idx_po_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_group ON public.production_orders USING btree (group_key);


--
-- Name: idx_po_machine; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_machine ON public.production_orders USING btree (machine_id);


--
-- Name: idx_po_notdel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_notdel ON public.production_orders USING btree (is_deleted) WHERE (is_deleted = false);


--
-- Name: idx_po_planned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_planned ON public.production_orders USING btree (planned_date);


--
-- Name: idx_po_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_status ON public.production_orders USING btree (status);


--
-- Name: idx_products_area; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_area ON public.products USING btree (production_area);


--
-- Name: idx_products_attributes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_attributes ON public.products USING gin (attributes);


--
-- Name: idx_products_code_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_code_trgm ON public.products USING btree (lower((product_code)::text));


--
-- Name: idx_products_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_name_trgm ON public.products USING btree (lower((product_name)::text));


--
-- Name: idx_products_not_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_not_deleted ON public.products USING btree (is_deleted) WHERE (is_deleted = false);


--
-- Name: idx_products_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_type ON public.products USING btree (product_type);


--
-- Name: idx_psteps_proc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psteps_proc ON public.process_steps USING btree (process_id);


--
-- Name: idx_stock_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_product ON public.inventory_stock USING btree (product_id);


--
-- Name: idx_stock_speckey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_speckey ON public.inventory_stock USING btree (product_id, spec_key);


--
-- Name: idx_tasks_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_po ON public.production_tasks USING btree (production_order_id);


--
-- Name: idx_ws_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ws_date ON public.work_schedules USING btree (work_date);


--
-- Name: uq_stock_spec_lot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_stock_spec_lot ON public.inventory_stock USING btree (product_id, location_id, spec_key, lot_code);


--
-- Name: boms trg_boms_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_boms_updated BEFORE UPDATE ON public.boms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customers trg_customers_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: employees trg_employees_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: boms trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.boms FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('BOM', '5', 'bom_code');


--
-- Name: customers trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('KH', '5', 'customer_code');


--
-- Name: delivery_notes trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.delivery_notes FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('PG', '5', 'note_code');


--
-- Name: employees trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.employees FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('NV', '5', 'employee_code');


--
-- Name: locations trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.locations FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('VT', '4', 'location_code');


--
-- Name: machines trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.machines FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('MC', '4', 'machine_code');


--
-- Name: production_orders trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('LSX', '5', 'order_code');


--
-- Name: products trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('SP', '5', 'product_code');


--
-- Name: roles trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.roles FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('VT', '3', 'role_code');


--
-- Name: sales_orders trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('DH', '5', 'order_code');


--
-- Name: shifts trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('CA', '2', 'shift_code');


--
-- Name: tech_processes trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.tech_processes FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('QT', '4', 'process_code');


--
-- Name: warehouses trg_gen_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gen_code BEFORE INSERT ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.gen_code_trg('K', '3', 'warehouse_code');


--
-- Name: locations trg_locations_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_locations_updated BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: machines trg_machines_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_machines_updated BEFORE UPDATE ON public.machines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: production_orders trg_production_orders_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_production_orders_updated BEFORE UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: products trg_products_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: roles trg_roles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sales_orders trg_sales_orders_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sales_orders_updated BEFORE UPDATE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: shifts trg_shifts_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_shifts_updated BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: production_tasks trg_tasks_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.production_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tech_processes trg_tech_processes_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tech_processes_updated BEFORE UPDATE ON public.tech_processes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_users_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: warehouses trg_warehouses_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_warehouses_updated BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: work_schedules trg_work_schedules_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_work_schedules_updated BEFORE UPDATE ON public.work_schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: bom_lines bom_lines_bom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_lines
    ADD CONSTRAINT bom_lines_bom_id_fkey FOREIGN KEY (bom_id) REFERENCES public.boms(id) ON DELETE CASCADE;


--
-- Name: bom_lines bom_lines_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_lines
    ADD CONSTRAINT bom_lines_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.products(id);


--
-- Name: boms boms_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boms
    ADD CONSTRAINT boms_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.tech_processes(id);


--
-- Name: boms boms_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boms
    ADD CONSTRAINT boms_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: delivery_note_items delivery_note_items_delivery_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_note_items
    ADD CONSTRAINT delivery_note_items_delivery_note_id_fkey FOREIGN KEY (delivery_note_id) REFERENCES public.delivery_notes(id) ON DELETE CASCADE;


--
-- Name: delivery_note_items delivery_note_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_note_items
    ADD CONSTRAINT delivery_note_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: delivery_notes delivery_notes_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: delivery_notes delivery_notes_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notes
    ADD CONSTRAINT delivery_notes_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id);


--
-- Name: inventory_stock inventory_stock_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: inventory_stock inventory_stock_prod_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_prod_order_id_fkey FOREIGN KEY (prod_order_id) REFERENCES public.production_orders(id);


--
-- Name: inventory_stock inventory_stock_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: inventory_transactions inventory_transactions_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: inventory_transactions inventory_transactions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: locations locations_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: process_steps process_steps_input_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_steps
    ADD CONSTRAINT process_steps_input_product_id_fkey FOREIGN KEY (input_product_id) REFERENCES public.products(id);


--
-- Name: process_steps process_steps_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_steps
    ADD CONSTRAINT process_steps_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.machines(id);


--
-- Name: process_steps process_steps_output_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_steps
    ADD CONSTRAINT process_steps_output_product_id_fkey FOREIGN KEY (output_product_id) REFERENCES public.products(id);


--
-- Name: process_steps process_steps_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_steps
    ADD CONSTRAINT process_steps_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.tech_processes(id) ON DELETE CASCADE;


--
-- Name: product_attachments product_attachments_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_attachments
    ADD CONSTRAINT product_attachments_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: production_material_usage production_material_usage_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_material_usage
    ADD CONSTRAINT production_material_usage_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.products(id);


--
-- Name: production_material_usage production_material_usage_production_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_material_usage
    ADD CONSTRAINT production_material_usage_production_order_id_fkey FOREIGN KEY (production_order_id) REFERENCES public.production_orders(id) ON DELETE CASCADE;


--
-- Name: production_orders production_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_orders
    ADD CONSTRAINT production_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: production_orders production_orders_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_orders
    ADD CONSTRAINT production_orders_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.machines(id);


--
-- Name: production_orders production_orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_orders
    ADD CONSTRAINT production_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: production_orders production_orders_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_orders
    ADD CONSTRAINT production_orders_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id);


--
-- Name: production_orders production_orders_sales_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_orders
    ADD CONSTRAINT production_orders_sales_order_item_id_fkey FOREIGN KEY (sales_order_item_id) REFERENCES public.sales_order_items(id) ON DELETE SET NULL;


--
-- Name: production_tasks production_tasks_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_tasks
    ADD CONSTRAINT production_tasks_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.machines(id);


--
-- Name: production_tasks production_tasks_production_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_tasks
    ADD CONSTRAINT production_tasks_production_order_id_fkey FOREIGN KEY (production_order_id) REFERENCES public.production_orders(id) ON DELETE CASCADE;


--
-- Name: sales_order_items sales_order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT sales_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: sales_order_items sales_order_items_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_items
    ADD CONSTRAINT sales_order_items_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE CASCADE;


--
-- Name: sales_orders sales_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: tech_processes tech_processes_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tech_processes
    ADD CONSTRAINT tech_processes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: work_schedules work_schedules_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_schedules
    ADD CONSTRAINT work_schedules_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: work_schedules work_schedules_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_schedules
    ADD CONSTRAINT work_schedules_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- PostgreSQL database dump complete
--


