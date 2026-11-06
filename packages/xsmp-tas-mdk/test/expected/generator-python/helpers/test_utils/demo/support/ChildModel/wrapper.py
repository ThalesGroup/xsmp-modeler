from importlib import import_module as _import_module
_BaseWrapper = getattr(_import_module('TasMdk__CommonModels.test_utils.TasMdk.Model'), 'ModelWrapper')

class ChildModelWrapper( _BaseWrapper ):
    builder = _import_module('ProfileGenerators.builder.demo.support.ChildModel')
