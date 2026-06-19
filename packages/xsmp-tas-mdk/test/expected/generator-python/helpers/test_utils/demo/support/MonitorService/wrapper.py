#!/usr/bin/env python
# -*- coding: utf-8 -*-
from TasMdk__CommonModels.test_utils.TasMdk.tools.model_wrapper import ModelWrapper
from ProfileGenerators.builder.demo.support import MonitorService

class MonitorServiceWrapper( ModelWrapper ):
    builder = MonitorService
