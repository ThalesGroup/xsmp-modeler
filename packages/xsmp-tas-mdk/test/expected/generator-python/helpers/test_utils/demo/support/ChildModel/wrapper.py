from TasMdk__CommonModels.test_utils.TasMdk.Model import ModelWrapper
from ProfileGenerators.builder.demo.support import ChildModel

class ChildModelWrapper( ModelWrapper ):
    builder = ChildModel
