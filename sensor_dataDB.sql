-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.sensor_data (
  id integer NOT NULL DEFAULT nextval('sensor_data_id_seq'::regclass),
  temperature numeric NOT NULL,
  humidity numeric NOT NULL,
  heat_index numeric,
  mac_id character varying,
  recorded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  risk_color character varying DEFAULT ''::character varying,
  CONSTRAINT sensor_data_pkey PRIMARY KEY (id)
);