from TasMdk__CommonModels.test_utils.TasMdk.tools.model_wrapper import ModelWrapper
from ProfileGenerators.builder.demo.support import ChildModel

class ChildModelWrapper( ModelWrapper ):
    builder = ChildModel
