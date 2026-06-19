#!/usr/bin/env python
# -*- coding: utf-8 -*-

# Model specific data
IMPLEMENTATIONS = ["demo.support.IDevice"]
REFERENCES = [{"name":"deviceRef","kind":"demo.support.IDevice"},{"name":"childRef","kind":"demo.support.ChildModel"}]
EVENTSINKS = ["onTick"]
EVENTSOURCES = ["onDone"]
