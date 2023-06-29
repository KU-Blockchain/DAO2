import React, { useState, useEffect } from 'react';
import {CSSReset,extendTheme, ChakraProvider, Text, Box, useDisclosure, Flex, Grid, Container, Spacer, VStack, Heading, Tabs, TabList, Tab, TabPanels, TabPanel, Button, Collapse, FormControl, FormLabel, Input, Textarea, RadioGroup, Stack, Radio, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter } from '@chakra-ui/react';


import { ethers } from 'ethers';
import KubixVotingABI from '../abi/KubixVoting.json';
import { useDataBaseContext } from '@/contexts/DataBaseContext';
import { useWeb3Context } from '@/contexts/Web3Context';
import { useToast } from '@chakra-ui/react';
import { BarChart, Bar, XAxis, YAxis} from 'recharts';
import CountDown from '@/components/voting/countDown';

const glassLayerStyle = {
  position: "absolute",
  height: "100%",
  width: "100%",
  zIndex: -1,
  borderRadius: "inherit",
  backdropFilter: "blur(20px)",
  backgroundColor: "rgba(0, 0, 0, .6)",
};


const provider = new ethers.providers.JsonRpcProvider('https://rpc-mumbai.maticvigil.com/');
const signer = new ethers.Wallet(process.env.NEXT_PUBLIC_PRIVATE_KEY, provider);
const contract = new ethers.Contract('0x4B99866ecE2Fe4b57882EA4715380921EEd2242c', KubixVotingABI.abi, signer);

const Voting = () => {
  const { findMinMaxKubixBalance } = useDataBaseContext();
  const { account } = useWeb3Context();

  const [proposal, setProposal] = useState({ name: '', description: '', execution: '', time: 0, options: [] ,id:0 });
  const [selectedTab, setSelectedTab] = useState(0);
  const [showCreateVote, setShowCreateVote] = useState(false);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [ongoingPolls, setOngoingPolls] = useState([]);
  const [blockTimestamp, setBlockTimestamp] = useState(0);
  const [completedPolls, setCompletedPolls] = useState([]);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedPoll, setSelectedPoll] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);

  const [loadingSubmit, setLoadingSubmit] = useState(false)

  const [loadingVote, setLoadingVote] = useState(false)


  const toast = useToast();

  const handlePollClick = (poll) => {
    setSelectedPoll(poll);
    onOpen();
  };

  const handleVote = async () => {
    setLoadingVote(true)
    if (selectedOption === null) {
      toast({
        title: 'Error',
        description: 'Please select an option to vote',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });

      setLoadingVote(false)
      return;
    }
    
    try {
      // Call the vote function from the contract
      console.log(selectedPoll.id, account, selectedOption[0])
      console.log(account)
      const tx = await contract.vote(selectedPoll.id, account, selectedOption[0]);
      await tx.wait();
      toast({
        title: 'Vote submitted',
        description: 'Your vote has been submitted successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      onClose();
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error',
        description: 'There was an error submitting your vote. Please try again.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }

    setLoadingVote(false)
  };

  const fetchPolls = async () => {
    try {
        await contract.moveToCompleted();

        const ongoingPollsCount = await contract.activeProposalsCount();
        const completedPollsCount = await contract.completedProposalsCount();

        const ongoingPolls = await fetchPollsData(ongoingPollsCount, false);
        const completedPolls = await fetchPollsData(completedPollsCount, true);

        setOngoingPolls(ongoingPolls);
        setCompletedPolls(completedPolls);
    } catch (error) {
        console.error(error);
    }
};

useEffect(() => {
    fetchPolls();
}, []);

const fetchPollsData = async (pollsCount, completed) => {
    const pollsData = [];

    for (let i = 0; i < pollsCount; i++) {
        const proposalId = completed ? await contract.completedProposalIndices(i) : await contract.activeProposalIndices(i+1);
        const proposal = await contract.activeProposals(proposalId);

        const optionsCount = await contract.getOptionsCount(proposalId);
        const pollOptions = [];

        for (let j = 0; j < optionsCount; j++) {
            const option = await contract.getOption(proposalId, j);
            pollOptions.push(option);
        }

        let pollWithOptions = { ...proposal, options: pollOptions, id: proposalId, remainingTime: proposal.timeInMinutes * 60 - (Math.floor(Date.now() / 1000) - proposal.creationTimestamp) };

        if (completed) {
            const winner = await contract.getWinner(i);
            pollWithOptions = { ...pollWithOptions, winner };
        }

        pollsData.push(pollWithOptions);
    }

    return pollsData;
};


  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProposal({ ...proposal, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoadingSubmit(true)
    try {

      await createPoll();
      toast({
        title: 'Poll created successfully',
        description: 'Your poll has been created.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      // Reset the form
      setProposal({ name: '', description: '', execution: '', time: 0, options: [] });
      setShowCreatePoll(false);
      fetchPolls();
//bugs: modal card dispalying last vote, glass modal overlay bad, ongoing votes doesnt have glass properly applied
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error creating poll',
        description: 'There was an error creating the poll. Please try again.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }

    setLoadingSubmit(false)
  };

  const handleTabsChange = (index) => {
    setSelectedTab(index);
  };

  const createPoll = async () => {
    const balances = await findMinMaxKubixBalance();
    console.log('proposal:', proposal);
    console.log('balances:', balances);
  
    // Parse the options string into an array
    const optionsArray = proposal.options.map(option => option.trim());
  
    const tx = await contract.createProposal(proposal.name, proposal.description, proposal.execution, balances.maxBalance, balances.minBalance, proposal.time, optionsArray);
    await tx.wait();
  };
  
  const handleOptionsChange = (e) => {
    // Split the input string by comma to get an array of options
    const options = e.target.value.split(', ');
    setProposal({ ...proposal, options });
  };
  

  
  async function fetchBlockTimestamp() {
    const currentBlock = await provider.getBlock('latest');
    setBlockTimestamp(currentBlock.timestamp);
  }

  useEffect(() => {
    fetchBlockTimestamp();
  }, []);

  const handleCreatePollClick = () => {
    setShowCreatePoll(!showCreatePoll);
  };



  
  

  return (
    <>
    <Container maxW="container.xl" py={8} >
      <Flex align="center" mb={8}
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                borderRadius="3xl"
                boxShadow="lg"
                p="2%"
                w="100%"
                
                bg="transparent"
                position="relative"
                display="flex"
                zIndex={0}
                >
      <div className="glass" style={glassLayerStyle} />
        <Heading color= "ghostwhite"size="xl">{selectedTab === 0 ? 'Democracy Voting (KUBI)' : 'Polling (KUBIX)'}</Heading>
        <Spacer />
        <Button fontWeight="black" p="2%" w="20%"bg="green.300" mt="2%" onClick={handleCreatePollClick} _hover={{ bg: "green.400",  transform: "scale(1.05)"} }>
          {selectedTab === 0 ? (showCreateVote ? 'Hide Create Vote Form' : 'Create Vote') : (showCreatePoll ? 'Hide Create Poll Form' : 'Create Poll')}
        </Button>
      </Flex>
  
      <Tabs isFitted variant="enclosed" onChange={handleTabsChange} mb={8}>
        
        <TabList          
          alignItems="center"
          justifyContent="center"
          borderRadius="3xl"
          boxShadow="lg"
          p={6}
          w="100%"
          bg="transparent"
          position="relative"
          display="flex"
          zIndex={0}
          color= "ghostwhite"
          
        >
          <div className="glass" style={glassLayerStyle} />
          <Tab fontSize="2xl" fontWeight="extrabold" >Votes</Tab>
          <Tab fontSize="2xl"fontWeight="extrabold">Polls</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <Grid templateColumns={{ sm: "1fr", md: "repeat(2, 1fr)" }} gap={6}>
              {/* Ongoing Votes */}
              <VStack spacing={4}>
                <Heading size="md">Ongoing Votes</Heading>
                {/* List ongoing votes here */}
              </VStack>
  
              {/* History */}
              <VStack spacing={4}>
                <Heading size="md">History</Heading>
                {/* List historical votes here */}
              </VStack>
            </Grid>
  
            {/* Create Vote Form */}
            <Collapse in={showCreateVote}>
              {/* Your form goes here */}
            </Collapse>
          </TabPanel>
  
          <TabPanel>
            <Grid templateColumns={{ sm: "1fr", md: "repeat(2, 1fr)" }} gap={6}>
              {/* Ongoing Polls */}
              <VStack spacing={4}>
              <Heading color="ghostwhite" mt="4"mb="4"size="lg">Ongoing Polls</Heading>
              {(ongoingPolls).map((poll, index) => (
                <Box key={index} flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                  borderRadius="3xl"
                  boxShadow="lg"
                  display="flex"
                  w="100%"
                  maxWidth="90%"
                  bg="transparent"
                  position="relative"
                  p={4}
                  zIndex={1}
                  mt={4} 
                  color= "ghostwhite"  
                  _hover={{ bg: "black", boxShadow: "md", transform: "scale(1.05)"}}
                  onClick={() => handlePollClick(poll)}>
                  <div className="glass" style={glassLayerStyle} />
                  <Text mb ="2" fontSize="2xl" fontWeight="extrabold">{poll.name}</Text>
                  <Text mb="4">{poll.description}</Text>
                  <CountDown duration={poll.remainingTime} />
                  <Text mt="4">Options:</Text>
                  <VStack spacing={2}>
                    {poll.options.map((option, index) => (
                      <Text key={index}>{option.optionName}</Text>
                    ))}
                  </VStack>
                </Box>
              ))}
            </VStack>
  
              {/* History */}
              <VStack spacing={4}>
                <Heading color="ghostwhite" mt="4"mb="4"size="lg">History</Heading>
                {completedPolls.map((poll, index) => {
                  const totalVotes = poll.options.reduce((total, option) => total + ethers.BigNumber.from(option.votes).toNumber(), 0);
                  
                  const predefinedColors = ['red', 'darkblue', 'yellow', 'purple'];
                  
                  const data = [{ name: 'Options', values: poll.options.map((option, index) => {
                    const color = index < predefinedColors.length ? predefinedColors[index] : `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 1)`;
                    return {
                      value: (ethers.BigNumber.from(option.votes).toNumber() / totalVotes) * 100,
                      color: color
                    };
                  }) }];

                return (
                  <Box key={index} flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                  borderRadius="3xl"
                  boxShadow="lg"
                  display="flex"
                  w="100%"
                  maxWidth="90%"
                  bg="transparent"
                  position="relative"
                  p={4}
                  zIndex={1}
                  mt={4} 
                  color= "ghostwhite">
                    <div className="glass" style={glassLayerStyle} />
                    <Text mb ="2" fontSize={"2xl"} fontWeight="extrabold">{poll.name}</Text>
                    <Text mb ="4">{poll.description}</Text>
                    <Flex  justifyContent="center">
                      <BarChart  width={400} height={50} layout="vertical" data={data}>
                        <XAxis type="number" hide="true" />
                        <YAxis type="category" dataKey="name" hide="true" />
                      {data[0].values.map((option, index) => (
                        <Bar key={index} dataKey={`values[${index}].value`} stackId="a" fill={option.color} />
                      ))}
                    </BarChart>

                    </Flex>

                    <Text fontSize="2xl" fontWeight="extrabold">Winner: {poll.winner}</Text>
                  </Box>
                );
              })}
              </VStack>
            </Grid>
            {/* Create Poll Form */}
            <Modal isOpen={showCreatePoll} onClose={handleCreatePollClick}>
              <ModalOverlay />
              <ModalContent>
                <ModalHeader>Create a Poll</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                  <VStack as="form" onSubmit={handleSubmit} spacing={4} mt={8} w="100%">
                  <FormControl>
                    <FormLabel>Name</FormLabel>
                    <Input
                      type="text"
                      name="name"
                      value={proposal.name}
                      onChange={handleInputChange}
                      required
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Description</FormLabel>
                    <Textarea
                      name="description"
                      value={proposal.description}
                      onChange={handleInputChange}
                      required
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Execution</FormLabel>
                    <Textarea
                      name="execution"
                      value={proposal.execution}
                      onChange={handleInputChange}
                      required
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Time</FormLabel>
                    <Input
                      type="number"
                      name="time"
                      value={proposal.time}
                      onChange={handleInputChange}
                      required
                    />
                  </FormControl>
                  <FormControl>
                  <FormControl>
                    <FormLabel>Options</FormLabel>
                    <Textarea
                      name="options"
                      value={proposal.options.join(', ')}
                      onChange={handleOptionsChange}
                      placeholder="Option 1, Option 2, Option 3"
                      required
                    />
                  </FormControl>
                  </FormControl>
                  </VStack>
                </ModalBody>
                <ModalFooter>
                  <Button type="submit" colorScheme="teal" onClick={handleSubmit}
                  isLoading={loadingSubmit}
                  loadingText="Handling Process">
                    Submit Poll
                  </Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
          </TabPanel>
        </TabPanels>
      </Tabs>
  
      {/* Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
  <ModalOverlay />
  <ModalContent
      alignItems="center"
      justifyContent="center"
      borderRadius="3xl"
      boxShadow="lg"
      display="flex"
      w="100%"
      maxWidth="40%"
      bg="transparent"
      position="relative"
      p={4}
      zIndex={1}
      mt="10%"
      color="ghostwhite"
  >
    <div className="glass" style={glassLayerStyle} />
    <ModalHeader >{selectedPoll?.name}</ModalHeader>
    <ModalCloseButton />
    <ModalBody>

      <VStack spacing={4}>
        <Text>{selectedPoll?.description}</Text>
        <Text>Total Minutes: {ethers.BigNumber.from(selectedPoll?.timeInMinutes || 0).toNumber()}</Text>
        <Text>Creation Time: {new Date(ethers.BigNumber.from(selectedPoll?.creationTimestamp || 0).toNumber() * 1000).toLocaleString()}</Text>
        <Text fontWeight="bold" fontSize="xl">Remaining Time: </Text>
        <CountDown duration={selectedPoll?.remainingTime} />
        <RadioGroup onChange={setSelectedOption} value={selectedOption}>
          <VStack spacing={4}>
            {selectedPoll?.options?.map((option, index) => (
              <Radio key={index} value={index}>
                {option.optionName} (Votes: {ethers.BigNumber.from(option.votes).toNumber()})
              </Radio>
            ))}
          </VStack>
        </RadioGroup>
      </VStack>
    </ModalBody>


    <ModalFooter>
      <Button colorScheme="blue" onClick={handleVote} mr={3} isLoading={loadingVote} loadingText="Handling Vote">
        Vote
      </Button>
    </ModalFooter>
  </ModalContent>
</Modal>
</Container>
</>
);
  
  
};

export default Voting;
